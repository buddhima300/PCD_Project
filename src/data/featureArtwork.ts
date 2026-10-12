import type { CSSProperties } from 'react';


export type FeatureImage = 'workforce' | 'scheduling' | 'operations' | 'insights' | 'recruitment' | 'training' | 'rotation' | 'breaks' | 'notifications' | 'audit' | 'settings' | 'handover' | 'conduct' | 'replacements' | 'departments' | 'assignments' | 'equipment';

const illustrations: Partial<Record<FeatureImage, number>> = {
  recruitment: 0, training: 1, rotation: 2, breaks: 3, notifications: 4, audit: 5,
  settings: 6, handover: 7, conduct: 8, replacements: 9, departments: 10, assignments: 11,
};
const overview: Partial<Record<FeatureImage, string>> = {
  workforce: '0% 0%', scheduling: '100% 0%', operations: '0% 100%', insights: '100% 100%',
};

export function featureImageStyle(image: FeatureImage): CSSProperties {
  const tile = illustrations[image];
  if (tile !== undefined) return {
    backgroundImage: "url('/images/feature-detail-illustrations.png')",
    backgroundSize: '300% 400%',
    backgroundPosition: `${tile % 3 * 50}% ${Math.floor(tile / 3) * 100 / 3}%`,
  };
  if (image === 'equipment') return {
    backgroundImage: "url('/images/equipment-ember-illustrations.png')", backgroundSize: '200% 400%', backgroundPosition: '100% 66.666%',
  };
  return { backgroundImage: "url('/images/supervisor-feature-illustrations.png')", backgroundSize: '200% 200%', backgroundPosition: overview[image] };
}

export function featureImageForTitle(title: string): FeatureImage {
  if (/handover|chronological/i.test(title)) return 'handover';
  if (/incident|warning|conduct/i.test(title)) return 'conduct';
  if (/notification|alert/i.test(title)) return 'notifications';
  if (/training|evaluation/i.test(title)) return 'training';
  if (/candidate|register|recruit/i.test(title)) return 'recruitment';
  if (/rotation/i.test(title)) return 'rotation';
  if (/break/i.test(title)) return 'breaks';
  if (/replacement|eligible freelancer/i.test(title)) return 'replacements';
  if (/assignment|placement|workflow/i.test(title)) return 'assignments';
  if (/configuration|business rules|integration|settings/i.test(title)) return 'settings';
  if (/history|audit/i.test(title)) return 'audit';
  if (/report|performance/i.test(title)) return 'insights';
  if (/workstation|laptop|pool/i.test(title)) return 'equipment';
  if (/off.day|shift|calendar|availability|approval|workload/i.test(title)) return 'scheduling';
  if (/department/i.test(title)) return 'departments';
  if (/staff|workforce|employee|freelancer/i.test(title)) return 'workforce';
  return 'operations';
}

