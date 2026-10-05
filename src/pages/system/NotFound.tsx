import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/States';

export function NotFound() {
  return (
    <Card>
      <EmptyState title="Page not found" description="This page doesn’t exist or you don’t have access to it." action={<Link to="/"><Button size="sm">Back to dashboard</Button></Link>} />
    </Card>);

}