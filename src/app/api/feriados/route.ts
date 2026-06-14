import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface NagerHoliday {
    date: string;
    localName: string;
    name: string;
    countryCode: string;
    fixed: boolean;
    global: boolean;
    counties: string[] | null;
    types: string[];
}

function getFallbackHolidays(year: number) {
    const f = Math.floor;
    const G = year % 19;
    const C = f(year / 100);
    const H = (C - f(C / 4) - f((8 * C + 13) / 25) + 19 * G + 15) % 30;
    const I = H - f(H / 28) * (1 - f(29 / (H + 1)) * f((21 - G) / 11));
    const J = (year + f(year / 4) + I + 2 - C + f(C / 4)) % 7;
    const L = I - J;
    
    const month = 3 + f((L + 40) / 44);
    const day = L + 28 - 31 * f(month / 4);
    
    // Easter Date object in local server time
    const easter = new Date(year, month - 1, day);
    
    // Helper to format Date to YYYY-MM-DD using local components
    const formatDate = (d: Date) => {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    };
    
    // Helper to add days safely in local time
    const addDays = (d: Date, days: number) => {
        const res = new Date(d.getTime());
        res.setDate(res.getDate() + days);
        return res;
    };
    
    const holidays = [
        { date: `${year}-01-01`, name: "Confraternização Universal (Ano Novo)" },
        { date: formatDate(addDays(easter, -48)), name: "Carnaval (Segunda-feira)" },
        { date: formatDate(addDays(easter, -47)), name: "Carnaval (Terça-feira)" },
        { date: formatDate(addDays(easter, -2)), name: "Sexta-feira Santa" },
        { date: formatDate(addDays(easter, 0)), name: "Páscoa" },
        { date: `${year}-04-21`, name: "Dia de Tiradentes" },
        { date: `${year}-05-01`, name: "Dia do Trabalhador" },
        { date: formatDate(addDays(easter, 60)), name: "Corpus Christi" },
        { date: `${year}-07-09`, name: "Revolução Constitucionalista de 1932 (Feriado Estadual - SP)" },
        { date: `${year}-09-07`, name: "Dia da Independência do Brasil" },
        { date: `${year}-10-12`, name: "Nossa Senhora Aparecida" },
        { date: `${year}-11-02`, name: "Finados" },
        { date: `${year}-11-15`, name: "Proclamação da República" },
        { date: `${year}-11-20`, name: "Dia Nacional de Zumbi e da Consciência Negra" },
        { date: `${year}-12-25`, name: "Natal" }
    ];
    
    return holidays.sort((a, b) => a.date.localeCompare(b.date));
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const yearVal = searchParams.get('year') || new Date().getFullYear().toString();
        const year = parseInt(yearVal, 10);

        try {
            // Chamada à API Nager.Date (gratuita e sem necessidade de chave)
            const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/BR`);
            if (!response.ok) {
                throw new Error(`Nager.Date respondeu com status ${response.status}`);
            }
            const data: NagerHoliday[] = await response.json();
            
            // Filtra os feriados para manter nacionais (global) ou estaduais de SP (BR-SP)
            const filtered = data
                .filter(h => h.global || (h.counties && h.counties.includes("BR-SP")))
                .map(h => ({
                    date: h.date,
                    name: h.localName || h.name
                }));
            
            return NextResponse.json(filtered);
        } catch (apiError) {
            console.warn("API de feriados indisponível. Utilizando fallback matemático local:", apiError);
            const fallback = getFallbackHolidays(year);
            return NextResponse.json(fallback);
        }
    } catch (error) {
        console.error("Erro geral no proxy de feriados:", error);
        return NextResponse.json({ error: 'Erro ao buscar feriados' }, { status: 500 });
    }
}

