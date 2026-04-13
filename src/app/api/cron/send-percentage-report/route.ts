import { NextResponse } from 'next/server';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebaseConfig';
import nodemailer from 'nodemailer';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const today = new Date().toISOString().split("T")[0];

        // 1. Buscar todos os alunos para saber o total por turma
        const studentsSnap = await getDocs(collection(db, "students"));
        const studentsPerClass: Record<string, number> = {};
        
        const normalizeClassName = (name: string) => name ? name.trim().toUpperCase().replace(/°/g, 'º') : "";
        studentsSnap.docs.forEach(doc => {
            const cls = normalizeClassName(doc.data().class);
            studentsPerClass[cls] = (studentsPerClass[cls] || 0) + 1;
        });

        // 2. Buscar as presenças do dia
        const attendanceRef = collection(db, "attendance");
        const q = query(attendanceRef, where("date", "==", today));
        const attendanceSnap = await getDocs(q);

        const presencesPerClass: Record<string, number> = {};
        const completedClasses = new Set<string>();

        attendanceSnap.docs.forEach(doc => {
            const data = doc.data();
            const clsNorm = normalizeClassName(data.studentClass);
            completedClasses.add(clsNorm);
            // Consideramos P (Presença) e D (Dispensa Médica) como "Frequentes" para o cálculo
            if (data.status === "P" || data.status === "D") {
                presencesPerClass[clsNorm] = (presencesPerClass[clsNorm] || 0) + 1;
            }
        });

        // 3. Buscar admins para destinatários
        const adminEmails: string[] = [];
        const { searchParams } = new URL(request.url);
        const targetEmail = searchParams.get('email');
        const loggedUserEmail = searchParams.get('loggedUserEmail');

        if (targetEmail) {
            adminEmails.push(targetEmail);
        } else {
            const rolesRef = collection(db, "roles");
            const rolesQuery = query(rolesRef, where("role", "==", "admin"));
            const rolesSnapshot = await getDocs(rolesQuery);
            rolesSnapshot.docs.forEach(d => adminEmails.push(d.data().email));

            const rootAdmin = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
            if (rootAdmin && !adminEmails.includes(rootAdmin)) adminEmails.push(rootAdmin);
        }

        if (loggedUserEmail && !adminEmails.includes(loggedUserEmail)) {
            adminEmails.push(loggedUserEmail);
        }

        if (adminEmails.length === 0) {
            return NextResponse.json({ error: 'Nenhum administrador encontrado.' }, { status: 400 });
        }

        // 4. Montar o Relatório
        const sortedClasses = Object.keys(studentsPerClass).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        const dateBR = new Date().toLocaleDateString("pt-BR");

        let tableRows = "";
        sortedClasses.forEach(cls => {
            const total = studentsPerClass[cls];
            const present = presencesPerClass[cls] || 0;
            const isCompleted = completedClasses.has(cls);
            
            let percentage = 0;
            if (isCompleted && total > 0) {
                percentage = Math.round((present / total) * 100);
            }

            const statusColor = !isCompleted ? "#9ca3af" : (percentage >= 90 ? "#16a34a" : (percentage >= 85 ? "#ca8a04" : "#dc2626"));
            const statusText = !isCompleted ? "Pendente" : `${percentage}%`;

            tableRows += `
                <tr style="border-bottom: 1px solid #f3f4f6;">
                    <td style="padding: 12px; font-weight: bold; color: #111827;">Turma ${cls}</td>
                    <td style="padding: 12px; text-align: center; color: #4b5563;">${total}</td>
                    <td style="padding: 12px; text-align: center; color: #4b5563;">${isCompleted ? present : "-"}</td>
                    <td style="padding: 12px; text-align: center;">
                        <span style="background-color: ${statusColor}15; color: ${statusColor}; padding: 4px 8px; border-radius: 6px; font-weight: bold; font-size: 13px;">
                            ${statusText}
                        </span>
                    </td>
                </tr>
            `;
        });

        const htmlContent = `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #374151; max-width: 600px; margin: 20px auto; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);">
                <div style="background-color: #1e293b; padding: 30px 20px; text-align: center;">
                    <h2 style="color: #ffffff; margin: 0; font-size: 22px; letter-spacing: -0.025em;">📊 Resumo de Frequência por Turma</h2>
                    <p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 14px;">Data: <strong>${dateBR}</strong></p>
                </div>
                <div style="padding: 24px;">
                    <p style="margin-bottom: 20px; font-size: 15px; line-height: 1.6;">
                        Prezada Direção, segue abaixo o comparativo de engajamento e frequência das turmas referente ao dia de hoje:
                    </p>
                    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                        <thead>
                            <tr style="background-color: #f8fafc; text-align: center; color: #64748b; font-weight: bold; font-size: 12px; text-transform: uppercase;">
                                <th style="padding: 12px; text-align: left;">Turma</th>
                                <th style="padding: 12px;">Total</th>
                                <th style="padding: 12px;">Presenças</th>
                                <th style="padding: 12px;">Frequência</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                    </table>
                    <div style="margin-top: 24px; padding: 12px; background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; font-size: 13px; color: #92400e;">
                        <strong>Nota:</strong> Turmas marcadas como "Pendente" ainda não tiveram o diário finalizado por nenhum professor hoje.
                    </div>
                </div>
                <div style="background-color: #f9fafb; padding: 16px; text-align: center; border-top: 1px solid #f1f5f9; font-size: 11px; color: #94a3b8;">
                    Relatório Automático do Sistema de Chamada Escolar.
                </div>
            </div>
        `;

        // 5. Configurar Nodemailer
        const port = Number(process.env.EMAIL_PORT) || 587;
        const transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST || "smtp.office365.com",
            port: port,
            secure: port === 465,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        await transporter.sendMail({
            from: `"Indicadores EE Gabriel Pozzi" <${process.env.EMAIL_USER}>`,
            to: adminEmails.join(', '),
            subject: `📊 Indicadores de Frequência (${dateBR})`,
            html: htmlContent
        });

        return NextResponse.json({
            message: 'Relatório de porcentagem enviado com sucesso!',
            totalClasses: sortedClasses.length
        });
    } catch (error) {
        console.error("Erro no relatório de porcentagem:", error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
