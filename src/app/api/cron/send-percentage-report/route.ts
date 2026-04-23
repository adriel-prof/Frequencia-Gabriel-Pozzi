import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import nodemailer from 'nodemailer';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const today = new Date().toISOString().split("T")[0];
        const LOCK_DATE = "2026-04-06";

        // 1. Buscar todos os alunos para saber o total por turma (USANDO ADMIN SDK)
        const studentsSnap = await adminDb.collection("students").get();
        const studentsPerClass: Record<string, number> = {};

        const normalizeClassName = (name: string) => name ? name.trim().toUpperCase().replace(/°/g, 'º') : "";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        studentsSnap.docs.forEach((doc: any) => {
            const cls = normalizeClassName(doc.data().class);
            studentsPerClass[cls] = (studentsPerClass[cls] || 0) + 1;
        });

        // 2. OTIMIZAÇÃO: Não buscamos mais todos os documentos. Usaremos count() por turma.
        const attendanceRef = adminDb.collection("attendance");
        
        // Agregadores específicos de HOJE
        const todayPresentPerClass: Record<string, number> = {};
        const completedClassesToday = new Set<string>();

        // Agregadores do Ano (Acumulado)
        const yearPresencePerClass: Record<string, number> = {};
        const yearTotalPerClass: Record<string, number> = {};

        // 2.1 Buscar dados de HOJE primeiro (para saber quem já fez a chamada)
        const todaySnap = await attendanceRef.where("date", "==", today).get();
        todaySnap.docs.forEach((doc: any) => {
            const data = doc.data();
            const clsNorm = normalizeClassName(data.studentClass);
            completedClassesToday.add(clsNorm);
            if (data.status === "P" || data.status === "D") {
                todayPresentPerClass[clsNorm] = (todayPresentPerClass[clsNorm] || 0) + 1;
            }
        });

        // 2.2 Para cada turma, buscar o acumulado via count()
        const sortedClasses = Object.keys(studentsPerClass).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        
        for (const cls of sortedClasses) {
            // Contagem total de registros da turma no ano
            const totalSnap = await attendanceRef
                .where("studentClass", "==", cls)
                .where("date", ">=", LOCK_DATE)
                .count()
                .get();
            
            // Contagem de presenças da turma no ano
            // Nota: Como 'in' custa o mesmo que queries separadas, mas é mais limpo
            const presenceSnap = await attendanceRef
                .where("studentClass", "==", cls)
                .where("date", ">=", LOCK_DATE)
                .where("status", "in", ["P", "D"])
                .count()
                .get();

            yearTotalPerClass[cls] = totalSnap.data().count;
            yearPresencePerClass[cls] = presenceSnap.data().count;
        }

        // 3. Buscar admins para destinatários
        const adminEmails: string[] = [];
        const { searchParams } = new URL(request.url);
        const targetEmail = searchParams.get('email');
        const loggedUserEmail = searchParams.get('loggedUserEmail');

        if (targetEmail) {
            adminEmails.push(targetEmail);
        } else {
            const rolesSnapshot = await adminDb.collection("roles").where("role", "==", "admin").get();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            rolesSnapshot.docs.forEach((d: any) => {
                const email = d.data().email;
                if (email && !adminEmails.includes(email)) adminEmails.push(email);
            });

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
        const dateBR = new Date().toLocaleDateString("pt-BR");

        let tableRows = "";
        sortedClasses.forEach(cls => {
            const totalStudents = studentsPerClass[cls];
            const presentToday = todayPresentPerClass[cls] || 0;
            const isCompletedToday = completedClassesToday.has(cls);

            // Porcentagem de HOJE
            let todayPercentage = 0;
            if (isCompletedToday && totalStudents > 0) {
                todayPercentage = Math.round((presentToday / totalStudents) * 100);
            }

            // Porcentagem ACUMULADA (Ano)
            const yearPresence = yearPresencePerClass[cls] || 0;
            const yearTotal = yearTotalPerClass[cls] || 0;
            let yearPercentage = 0;
            if (yearTotal > 0) {
                yearPercentage = Math.round((yearPresence / yearTotal) * 100);
            }

            const statusColor = !isCompletedToday ? "#9ca3af" : (todayPercentage >= 90 ? "#16a34a" : (todayPercentage >= 85 ? "#ca8a04" : "#dc2626"));
            const todayStatusText = !isCompletedToday ? "Pendente" : `${todayPercentage}%`;

            tableRows += `
                <tr style="border-bottom: 1px solid #f3f4f6;">
                    <td style="padding: 12px; font-weight: bold; color: #111827;">Turma ${cls}</td>
                    <td style="padding: 12px; text-align: center; color: #4b5563;">${totalStudents}</td>
                    <td style="padding: 12px; text-align: center;">
                        <span style="background-color: ${statusColor}15; color: ${statusColor}; padding: 4px 8px; border-radius: 6px; font-weight: bold; font-size: 13px;">
                            ${todayStatusText}
                        </span>
                    </td>
                    <td style="padding: 12px; text-align: center; font-weight: bold; color: #1e293b;">
                        ${yearPercentage}%
                    </td>
                </tr>
            `;
        });

        const htmlContent = `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #374151; max-width: 650px; margin: 20px auto; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);">
                <div style="background-color: #1e293b; padding: 30px 20px; text-align: center;">
                    <h2 style="color: #ffffff; margin: 0; font-size: 22px; letter-spacing: -0.025em;">📊 Indicadores Consolidados de Frequência</h2>
                    <p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 14px;">Relatório de <strong>${dateBR}</strong></p>
                </div>
                <div style="padding: 24px;">
                    <p style="margin-bottom: 20px; font-size: 15px; line-height: 1.6;">
                        Prezada Direção, segue o comparativo de frequência diária e o <strong>acumulado anual (desde 06/04)</strong> por turma:
                    </p>
                    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                        <thead>
                            <tr style="background-color: #f8fafc; text-align: center; color: #64748b; font-weight: bold; font-size: 12px; text-transform: uppercase;">
                                <th style="padding: 12px; text-align: left;">Turma</th>
                                <th style="padding: 12px;">Total Alunos</th>
                                <th style="padding: 12px;">Hoje</th>
                                <th style="padding: 12px;">Acumulado Ano</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                    </table>
                    <div style="margin-top: 24px; padding: 12px; background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; font-size: 13px; color: #0369a1;">
                        <strong>Informação:</strong> O cálculo acumulado considera todos os registros de presença realizados desde o início do período letivo (06/04/2026).
                    </div>
                </div>
                <div style="background-color: #f9fafb; padding: 16px; text-align: center; border-top: 1px solid #f1f5f9; font-size: 11px; color: #94a3b8;">
                    Relatório Automático do Sistema de Chamada Escolar.
                </div>
            </div>
        `;

        // 5. Configurar Nodemailer com validação
        const emailUser = process.env.EMAIL_USER;
        const emailPass = process.env.EMAIL_PASS;
        const emailHost = process.env.EMAIL_HOST || "smtp.gmail.com";
        const emailPort = Number(process.env.EMAIL_PORT) || 465;

        if (!emailUser || !emailPass) {
            console.error("ERRO: EMAIL_USER ou EMAIL_PASS não configurados.");
            return NextResponse.json({ error: 'Configuração de e-mail incompleta.' }, { status: 500 });
        }

        const transporter = nodemailer.createTransport({
            host: emailHost,
            port: emailPort,
            secure: emailPort === 465,
            auth: {
                user: emailUser,
                pass: emailPass,
            },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
        });

        console.log(`Enviando indicadores de frequência para: ${adminEmails.join(', ')}`);
        await transporter.sendMail({
            from: `"Indicadores EE Gabriel Pozzi" <${emailUser}>`,
            to: adminEmails.join(', '),
            subject: `📊 Indicadores de Frequência Consolidada (${dateBR})`,
            html: htmlContent
        });

        return NextResponse.json({
            message: 'Relatório de porcentagem enviado com sucesso!',
            totalClasses: sortedClasses.length,
            recipients: adminEmails.length
        });
    } catch (error) {
        console.error("ERRO no relatório de porcentagem:", error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
