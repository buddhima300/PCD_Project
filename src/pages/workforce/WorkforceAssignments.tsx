import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { WorkforceVacancies,type VacancySelection } from '../../components/placement/WorkforceVacancies';
import { ProductionAssignment } from '../../components/placement/ProductionAssignment';

export function WorkforceAssignments(){
  const [placement,setPlacement]=useState<VacancySelection|null>(null);
  return <div className="space-y-5"><PageHeader title="Platform vacancies" description="Browse production capacity by category, platform, department and shift. Assign qualified employees or freelancers to their current or a new platform." actions={<Link to="/training"><Button variant="secondary" size="sm">Review qualified trainees</Button></Link>}/><WorkforceVacancies onSelect={setPlacement}/>{placement&&<ProductionAssignment placement={placement} onClose={()=>setPlacement(null)}/>}</div>;
}
