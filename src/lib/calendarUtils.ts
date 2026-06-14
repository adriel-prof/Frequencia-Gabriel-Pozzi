/**
 * Utilitários para validações de datas e feriados no calendário letivo.
 */

/**
 * Verifica se a data fornecida cai em um final de semana (sábado ou domingo).
 * @param dateString Data no formato "YYYY-MM-DD"
 */
export function isWeekend(dateString: string): boolean {
    const parts = dateString.split('-');
    if (parts.length !== 3) return false;
    
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    
    // Cria o objeto Date utilizando o horário local, evitando problemas de fuso horário (UTC)
    const date = new Date(year, month - 1, day);
    const dayOfWeek = date.getDay();
    
    return dayOfWeek === 0 || dayOfWeek === 6; // 0 = Domingo, 6 = Sábado
}

/**
 * Retorna todas as datas no formato YYYY-MM-DD entre a data de início e de fim, inclusive.
 */
export function getDatesInRange(startDateStr: string, endDateStr: string): string[] {
    const dates: string[] = [];
    const startParts = startDateStr.split('-');
    const endParts = endDateStr.split('-');
    if (startParts.length !== 3 || endParts.length !== 3) return [startDateStr];

    const start = new Date(Number(startParts[0]), Number(startParts[1]) - 1, Number(startParts[2]));
    const end = new Date(Number(endParts[0]), Number(endParts[1]) - 1, Number(endParts[2]));

    const current = new Date(start);
    while (current <= end) {
        const yyyy = current.getFullYear();
        const mm = String(current.getMonth() + 1).padStart(2, '0');
        const dd = String(current.getDate()).padStart(2, '0');
        dates.push(`${yyyy}-${mm}-${dd}`);
        current.setDate(current.getDate() + 1);
    }
    return dates;
}

/**
 * Busca feriados nacionais utilizando a BrasilAPI (via proxy local para evitar CORS).
 * @param year Ano corrente
 */
export async function fetchBrasilAPIHolidays(year: number): Promise<{ date: string; name: string }[]> {
    try {
        const response = await fetch(`/api/feriados?year=${year}`);
        if (!response.ok) {
            throw new Error(`Falha ao buscar feriados da BrasilAPI via proxy: ${response.statusText}`);
        }
        const data = await response.json();
        return data.map((h: { date: string; name: string }) => ({
            date: h.date,
            name: h.name
        }));
    } catch (error) {
        console.error("Erro ao buscar feriados da BrasilAPI:", error);
        throw error;
    }
}

