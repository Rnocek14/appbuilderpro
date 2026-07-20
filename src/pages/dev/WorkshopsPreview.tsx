import Workshops from '../Workshops';
import type { WorkshopInstance } from '../../components/garvis/WorkshopCard';
import { makeCharter, toolsFor } from '../../lib/garvis/workweb';
import type { WebCluster } from '../../lib/garvis/workwebRun';

function cluster(
  id: string,
  title: string,
  flavor: Parameters<typeof makeCharter>[1],
  earnedArtifacts: number,
  pendingApprovals = 0,
): WebCluster {
  const charter = makeCharter('studio', flavor);
  return {
    id, slug: id, parentSlug: null, title,
    summary: `A focused ${title.toLowerCase()} area.`,
    charter, tools: toolsFor(charter), artifacts: [], earnedArtifacts,
    playbookArtifacts: earnedArtifacts ? 1 : 2,
    liveStatus: pendingApprovals ? 'waiting' : earnedArtifacts ? 'active' : 'dormant',
    pendingApprovals,
  };
}

const MOCKS: WorkshopInstance[] = [
  { worldId: 'mom', businessTitle: 'Mom Real Estate', cluster: cluster('postcards', 'Lakefront Postcards', 'direct_mail', 3, 1) },
  { worldId: 'mom', businessTitle: 'Mom Real Estate', cluster: cluster('social', 'Social Content', 'social', 8) },
  { worldId: 'garvis', businessTitle: 'Garvis', cluster: cluster('product', 'Product Innovation', 'feature_lab', 4) },
  { worldId: 'garvis', businessTitle: 'Garvis', cluster: cluster('video', 'Launch Video', 'video', 0) },
  { worldId: 'client', businessTitle: 'North Shore Studio', cluster: cluster('docs', 'Client Proposals', 'deliver', 2) },
  { worldId: 'client', businessTitle: 'North Shore Studio', cluster: cluster('data', 'Business Numbers', 'data', 0) },
];

export default function WorkshopsPreview() {
  return <Workshops previewInstances={MOCKS} />;
}
