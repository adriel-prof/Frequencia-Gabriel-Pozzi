import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const year = searchParams.get('year') || new Date().getFullYear().toString();

        const response = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`);
        if (!response.ok) {
            throw new Error(`BrasilAPI respondeu com status ${response.status}`);
        }
        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error("Erro no proxy de feriados da BrasilAPI:", error);
        return NextResponse.json({ error: 'Erro ao buscar feriados da BrasilAPI' }, { status: 500 });
    }
}
