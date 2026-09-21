export type StudentStats = {
    studentFirestoreId: string;
    studentId: number;
    studentName: string;
    studentClass: string;
    totalDays: number;
    absences: number;
    presences: number;
    dispensed: number;
    presenceRate: number;
    updatedAt?: unknown;
};

export function calculatePresenceRate(totalDays: number, absences: number): number {
    if (!totalDays || totalDays <= 0) return 0;
    const rate = Math.round(((totalDays - absences) / totalDays) * 100);
    return Math.max(0, Math.min(100, rate));
}
