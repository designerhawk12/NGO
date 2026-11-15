// Shared catalog projection for synthetic rehearsal and approved live maintenance.
const quote=s=>'"'+s.replaceAll('"','""')+'"';
async function protectedTables(client){
 return (await client.query("SELECT n.nspname AS schema,c.relname AS name,array_agg(a.attname::text ORDER BY a.attnum) AS columns FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped WHERE (n.nspname='app' OR(n.nspname='auth' AND c.relname<>'schema_migrations')) AND c.relkind='r' GROUP BY n.nspname,c.relname ORDER BY 1,2")).rows;
}
async function fingerprints(client,tables){
 const results=[];
 for(const t of tables){
  if(!Array.isArray(t.columns)||!t.columns.length)throw Error('Catalog column projection invalid');
  const columns=t.columns.map(quote).join(',');
  const r=(await client.query("SELECT count(*)::int n,md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' ORDER BY md5(to_jsonb(x)::text)),'')) digest FROM (SELECT "+columns+' FROM '+quote(t.schema)+'.'+quote(t.name)+') x')).rows[0];
  results.push({schema:t.schema,name:t.name,...r});
 }
 return results;
}
module.exports={protectedTables,fingerprints,quote};
