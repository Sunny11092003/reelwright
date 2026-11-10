import { JWT } from 'google-auth-library';
import { env } from '../../config/env';

export const ga4Configured = (): boolean => Boolean(env.GA4_PROPERTY_ID && env.GA4_CLIENT_EMAIL && env.GA4_PRIVATE_KEY);

/** Page views for one page path since a start date, using the GA4 Data API. */
export async function pageViews(pagePath: string, startDate: string): Promise<{ views: number; users: number }> {
  const client = new JWT({
    email: env.GA4_CLIENT_EMAIL, key: env.GA4_PRIVATE_KEY!.replace(/\\n/g, '\n'), scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
  });
  const res = await client.request<{ rows?: { metricValues: { value: string }[] }[] }>({
    url: `https://analyticsdata.googleapis.com/v1beta/properties/${env.GA4_PROPERTY_ID}:runReport`,
    method: 'POST',
    data: {
      dateRanges: [{ startDate, endDate: 'today' }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
      dimensionFilter: { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'EXACT', value: pagePath } } },
    },
  });
  const row = res.data.rows?.[0];
  return { views: Number(row?.metricValues[0]?.value ?? 0), users: Number(row?.metricValues[1]?.value ?? 0) };
}
