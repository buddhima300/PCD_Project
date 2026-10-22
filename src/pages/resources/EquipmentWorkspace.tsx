import { PageHeader } from '../../components/ui/PageHeader';
import { Laptops } from './Laptops';

export function EquipmentWorkspace() {
  return <div className="equipment-workspace">
    <PageHeader title="Equipment" description="Manage workstations and shared laptop inventory for configured platform seats." />
    <Laptops embedded />
  </div>;
}
