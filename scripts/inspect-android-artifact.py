"""Read-only APK manifest/configuration/credential-marker inspection; never prints keys."""
import argparse
import hashlib
import json
import os
import pathlib
import re
import struct
import urllib.parse
import zipfile


def manifest_metadata(blob):
    strings = []
    result = {'permissions': [], 'https_hosts': [], 'services': []}
    pos = struct.unpack_from('<H', blob, 2)[0]
    while pos < len(blob):
        kind, header, size = struct.unpack_from('<HHI', blob, pos)
        if size < header or not size:
            raise ValueError('Invalid binary manifest chunk')
        if kind == 1:
            count, _, flags, start, _ = struct.unpack_from('<IIIII', blob, pos + 8)

            def length(offset, utf8):
                first = blob[offset] if utf8 else struct.unpack_from('<H', blob, offset)[0]
                step, mask, shift = (1, 0x80, 8) if utf8 else (2, 0x8000, 16)
                if first & mask:
                    second = blob[offset + step] if utf8 else struct.unpack_from('<H', blob, offset + step)[0]
                    return ((first & (mask - 1)) << shift) | second, offset + 2 * step
                return first, offset + step

            for i in range(count):
                offset = pos + start + struct.unpack_from('<I', blob, pos + header + i * 4)[0]
                utf8 = bool(flags & 0x100)
                n, offset = length(offset, utf8)
                if utf8:
                    n, offset = length(offset, True)
                strings.append(blob[offset:offset + n * (1 if utf8 else 2)].decode('utf-8' if utf8 else 'utf-16le'))
        elif kind == 0x102:
            tag = strings[struct.unpack_from('<I', blob, pos + 20)[0]]
            start, attr_size, count = struct.unpack_from('<HHH', blob, pos + 24)
            attrs = {}
            for i in range(count):
                offset = pos + 16 + start + i * attr_size
                name = strings[struct.unpack_from('<I', blob, offset + 4)[0]]
                raw = struct.unpack_from('<I', blob, offset + 8)[0]
                datatype = blob[offset + 15]
                value = struct.unpack_from('<I', blob, offset + 16)[0]
                attrs[name] = strings[raw] if raw != 0xffffffff else strings[value] if datatype == 3 else value
            if tag == 'manifest':
                result['package'] = attrs.get('package')
            elif tag == 'uses-sdk':
                result['sdk'] = attrs
            elif tag.startswith('uses-permission'):
                result['permissions'].append(attrs.get('name'))
            elif tag == 'data' and attrs.get('scheme') == 'https' and attrs.get('host'):
                result['https_hosts'].append(attrs['host'])
            elif tag == 'service':
                result['services'].append({k: attrs[k] for k in ['name', 'foregroundServiceType'] if k in attrs})
        pos += size
    return result


def inspect(apk):
    raw = apk.read_bytes()
    with zipfile.ZipFile(apk) as archive:
        result = manifest_metadata(archive.read('AndroidManifest.xml'))
        bundles = [n for n in archive.namelist() if n.endswith(('.bundle', '.jsbundle'))]
        bundle = b'\n'.join(archive.read(n) for n in bundles)
    result.update({'apk_bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'bundles_scanned': bundles,
                   'staging_project_reference': b'tughgqggsndtraaymtvf' in bundle,
                   'staging_api_reference': b'aaharaconnect-ngo-staging-api.vercel.app' in bundle,
                   'production_project_reference': b'pyzyxgpcfwpcqyqrihuo' in bundle,
                   'generic_server_secret_marker_offsets': [m.start() for m in re.finditer(rb'sb_secret_[A-Za-z0-9_-]{20,}', bundle)],
                   'database_url_candidates': bool(re.search(rb'postgres(?:ql)?://', bundle)),
                   'private_key_candidates': b'-----BEGIN PRIVATE KEY-----' in bundle or b'-----BEGIN RSA PRIVATE KEY-----' in bundle})
    # Hermes stores adjacent strings without separators: a raw regex can join
    # the SDK's literal "sb_secret_" to a neighbouring, unrelated string.
    # Decode real boundaries using the official Hermes BytecodeFileFormat.h.
    if len(bundles) == 1 and len(bundle) >= 128 and struct.unpack_from('<Q', bundle)[0] == 0x1f1903c103bc1fc6:
        file_length, _, functions, kinds, identifiers, count, overflow_count, storage_size = struct.unpack_from('<8I', bundle, 32)
        version = struct.unpack_from('<I', bundle, 8)[0]
        # HBC98 uses compact 12-byte function headers; legacy HBC96 uses16.
        # Validate every entry below rather than trusting a raw substring scan.
        if version not in (96, 98):
            raise ValueError('Unsupported Hermes version; review before clearing scan hits')
        function_header_bytes = 12 if version == 98 else 16
        table = 128 + functions * function_header_bytes + kinds * 4 + identifiers * 4
        overflow = table + count * 4
        storage = overflow + overflow_count * 8
        if file_length != len(bundle) or storage + storage_size > len(bundle):
            raise ValueError('Unsupported Hermes layout; do not clear scan hits')
        entries = []
        for i in range(count):
            value = struct.unpack_from('<I', bundle, table + i * 4)[0]
            utf16, offset, length = value & 1, (value >> 1) & 0x7fffff, value >> 24
            if length == 255:
                if offset >= overflow_count:
                    raise ValueError('Invalid Hermes overflow entry')
                offset, length = struct.unpack_from('<II', bundle, overflow + offset * 8)
            size = length * (2 if utf16 else 1)
            if offset + size > storage_size:
                raise ValueError('Invalid Hermes string boundary')
            text = bundle[storage + offset:storage + offset + size]
            entries.append(text.decode('utf-16le', errors='surrogatepass').encode('utf-8', errors='surrogatepass') if utf16 else text)
        result['hermes_string_scan'] = {
            'version': version, 'function_header_bytes': function_header_bytes, 'entries_validated': count,
            'sdk_prefix_literal_entries': sum(x == b'sb_secret_' for x in entries),
            'actual_secret_shaped_string_entries': sum(bool(re.search(rb'sb_secret_[A-Za-z0-9_-]{20,}', x)) for x in entries),
        }
    if os.environ.get('AAHARA_INSPECT_PRIVATE_STAGING_CREDENTIALS') == 'true':
        from dotenv import dotenv_values
        found = []
        match_origins = []
        for name in ['staging.env', 'staging-runtime.env']:
            env = pathlib.Path(os.environ['LOCALAPPDATA']) / 'AahaaraConnect-Staging' / name
            values = dotenv_values(env)
            candidates = {k: v for k, v in values.items() if 'PASSWORD' in k or 'SECRET' in k}
            if values.get('DATABASE_URL'):
                candidates['database_password'] = urllib.parse.unquote(urllib.parse.urlparse(values['DATABASE_URL']).password or '')
            for label, value in candidates.items():
                if value and len(value) >= 8 and value.encode() in bundle:
                    found.append(name + ':' + label)
                    matching = [x for x in entries if value.encode() in x]
                    match_origins.append({'credential_label': label,
                                          'exact_string_entries': sum(x == value.encode() for x in matching),
                                          'container_entry_lengths': sorted(set(len(x) for x in matching)),
                                          'matches_public_digit_alphabet': any(b'0123456789' in x or b'1234567890' in x for x in matching),
                                          'all_containers_are_character_alphabets': bool(matching) and all(
                                              b'0123456789' in x and len(set(x)) == len(x)
                                              and len(x) in (16, 62, 64, 66) for x in matching)})
        local_env = pathlib.Path.cwd() / '.env.local'
        if local_env.exists():
            for label, value in dotenv_values(local_env).items():
                if value and ('TOKEN' in label or 'SECRET' in label) and value.encode() in bundle:
                    found.append('.env.local:' + label)
        result['known_private_value_raw_matches'] = found
        result['known_value_match_origins'] = match_origins
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('apk', type=pathlib.Path)
    args = parser.parse_args()
    print(json.dumps(inspect(args.apk)))
