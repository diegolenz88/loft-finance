import type {Metadata} from 'next';
import {getThemePreference} from '@/lib/theme';
import './globals.css';
export const metadata:Metadata={title:'Loft Finance | Gestão financeira da obra',description:'Despesas, aportes e receitas. A clareza que o seu empreendimento precisa.',icons:{icon:'/favicon.svg',shortcut:'/favicon.svg'}};
export default async function Layout({children}:{children:React.ReactNode}){const theme=await getThemePreference();return <html lang="pt-BR" data-theme={theme} className={theme==='dark'?'dark':undefined}><body>{children}</body></html>}
