import { COLLECTIONS } from '../shared/constants';
import type { ActivityLog, ConnectedAccount, DashboardData, GeneratedContent } from '../shared/types';
import { col, listByUser } from '../firebase/repo';

export async function getDashboard(userId: string): Promise<DashboardData> {
  const count = async (name: (typeof COLLECTIONS)[keyof typeof COLLECTIONS], field?: string, value?: string) => {
    let q: FirebaseFirestore.Query = col(name).where('userId', '==', userId);
    if (field) q = q.where(field, '==', value);
    return (await q.count().get()).data().count;
  };
  const [videos, content, published, scheduled, failed, accounts, recentContent, recentActivity] = await Promise.all([
    count(COLLECTIONS.videos, 'status', 'analyzed'),
    count(COLLECTIONS.content),
    count(COLLECTIONS.publishedPosts),
    count(COLLECTIONS.scheduledPosts, 'status', 'scheduled'),
    count(COLLECTIONS.publishingJobs, 'status', 'failed'),
    listByUser<ConnectedAccount>(COLLECTIONS.connectedAccounts, userId),
    listByUser<GeneratedContent>(COLLECTIONS.content, userId, { orderBy: 'createdAt', limit: 6 }),
    listByUser<ActivityLog>(COLLECTIONS.activityLogs, userId, { orderBy: 'createdAt', limit: 12 }),
  ]);
  return {
    counts: { videosProcessed: videos, contentGenerated: content, postsPublished: published, scheduledPosts: scheduled, failedPosts: failed },
    accounts, recentContent, recentActivity,
  };
}
