import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Loft Finance | Gestão financeira da obra',description:'Despesas, aportes e receitas. A clareza que o seu empreendimento precisa.',icons:{icon:'/favicon.svg',shortcut:'/favicon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="pt-BR" className="dark"><body>{children}</body></html>}
