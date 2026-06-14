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
 * Busca feriados nacionais utilizando a BrasilAPI.
 * @param year Ano corrente
 */
export async function fetchBrasilAPIHolidays(year: number): Promise<{ date: string; name: string }[]> {
    try {
        const response = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`);
        if (!response.ok) {
            throw new Error(`Falha ao buscar feriados da BrasilAPI: ${response.statusText}`);
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
