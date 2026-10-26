import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {currentIdentity} from '@/lib/identity';
import FinanceApp from './finance-app';

export const dynamic = 'force-dynamic';

export default async function Home(){
  const requestHeaders = await headers();
  const user = await currentIdentity(requestHeaders.get('cookie'));
  // Standalone deployments do not receive platform identity headers, so an
  // anonymous visitor is sent to the password screen instead of a blank 401.
  if (!user) redirect('/api/session');
  return <FinanceApp/>;
}
