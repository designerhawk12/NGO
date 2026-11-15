import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useApp } from '../../../context/AppContext';
import DriverJobs from '../../../components/driver/DriverJobs';
export default function DriverJobDetail() {
  const app = useApp(); const { id } = useLocalSearchParams<{id:string}>();
  if(app.role !== 'driver' || app.mode !== 'live') return <Redirect href="/volunteer/login" />;
  return <DriverJobs assignmentId={id} />;
}
