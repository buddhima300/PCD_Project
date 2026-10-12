import { cn } from '../../utils/cn';
import { featureImageStyle, type FeatureImage } from '../../data/featureArtwork';

export function FeatureArtwork({ image, className }: { image: FeatureImage; className?: string }) {
  return <span className={cn('feature-panel-art', className)} aria-hidden="true"><span style={{ ...featureImageStyle(image), aspectRatio: ['workforce', 'scheduling', 'operations', 'insights', 'equipment'].includes(image) ? 2 : 1 }} /></span>;
}
