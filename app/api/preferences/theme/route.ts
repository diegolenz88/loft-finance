import {NextRequest,NextResponse} from 'next/server';
import {failure,sameOrigin} from '@/lib/server';
import {parseTheme,themeCookieName} from '@/lib/theme';

export const dynamic='force-dynamic';

export async function POST(req:NextRequest){
  try{
    sameOrigin(req);
    const url=new URL(req.url);
    const secure=url.protocol==='https:'?'; Secure':'';
    const body=await req.json() as {theme?:string};
    const theme=parseTheme(body.theme);
    const response=NextResponse.json({theme},{headers:{'Cache-Control':'no-store'}});
    response.headers.append('Set-Cookie',`${themeCookieName}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`);
    return response;
  }catch(error){return failure(error)}
}