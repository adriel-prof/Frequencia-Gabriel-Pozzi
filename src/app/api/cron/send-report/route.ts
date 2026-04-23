import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import nodemailer from 'nodemailer';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const today = new Date().toISOString().split("T")[0];
        const LOCK_DATE = "2026-04-06";

        // OTIMIZAÇÃO: Busca apenas registros de HOJE para identificar pendências e faltosos
        const attendanceRef = adminDb.collection("attendance");
        const todaySnapshot = await attendanceRef.where("date", "==", today).get();

        // Agrupar faltosos por turma e registrar turmas concluídas
        type AttendanceDoc = { studentClass: string; studentId: number; studentName: string; status: string; date: string; };

        const absencesByClass: Record<string, { studentName: string; studentId: number; absenceRate: number }[]> = {};
        const completedClassesToday = new Set<string>();

        const normalizeClassName = (name: string) => name ? name.trim().toUpperCase().replace(/°/g, 'º') : "";
        
        const todayAbsences: AttendanceDoc[] = [];

        todaySnapshot.docs.forEach((doc: any) => {
            const data = doc.data() as AttendanceDoc;
            const clsNorm = normalizeClassName(data.studentClass);
            completedClassesToday.add(clsNorm);
            if (data.status === "F") {
                todayAbsences.push(data);
            }
        });

        // Para cada aluno que faltou HOJE, buscamos o histórico dele via count() (Economiza milhares de leituras)
        for (const student of todayAbsences) {
            const clsNorm = normalizeClassName(student.studentClass);
            
            // Query de contagem total (histórico)
            const totalDaysSnap = await attendanceRef
                .where("studentId", "==", student.studentId)
                .where("date", ">=", LOCK_DATE)
                .count()
                .get();
            
            // Query de contagem de faltas (histórico)
            const totalAbsencesSnap = await attendanceRef
                .where("studentId", "==", student.studentId)
                .where("date", ">=", LOCK_DATE)
                .where("status", "==", "F")
                .count()
                .get();

            const total = totalDaysSnap.data().count;
            const absences = totalAbsencesSnap.data().count;
            const absenceRate = total > 0 ? Math.round((absences / total) * 100) : 0;

            if (!absencesByClass[clsNorm]) {
                absencesByClass[clsNorm] = [];
            }
            absencesByClass[clsNorm].push({
                studentName: student.studentName,
                studentId: student.studentId,
                absenceRate: absenceRate
            });
        }


        // Buscar todas as turmas cadastradas nos alunos
        const studentsSnap = await adminDb.collection("students").get();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allClasses = (Array.from(new Set(studentsSnap.docs.map((d: any) => normalizeClassName(d.data().class)))) as string[])
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

        const missingClasses = allClasses.filter(cls => !completedClassesToday.has(cls));

        // Buscar admins para enviar e-mail
        const adminEmails: string[] = [];

        const { searchParams } = new URL(request.url);
        const targetEmail = searchParams.get('email');
        const loggedUserEmail = searchParams.get('loggedUserEmail');

        if (targetEmail) {
            // Se o usuário especificou um e-mail lá no Dashboard, manda SÓ PRA ELE (mas também inclui o logado depois)
            adminEmails.push(targetEmail);
        } else {
            // Comportamento normal automático: Busca os e-mails dos Admins Base

            // 1. Busca dos Professores promovidos a 'Admin'
            const rolesRef = adminDb.collection("roles");
            const rolesSnapshot = await rolesRef.where("role", "==", "admin").get();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const roleEmails = rolesSnapshot.docs.map((d: any) => d.data().email);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            roleEmails.forEach((email: any) => {
                if (!adminEmails.includes(email)) adminEmails.push(email);
            });

            // 2. Garante que o Admin raiz não fique de fora
            const rootAdmin = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
            if (rootAdmin && !adminEmails.includes(rootAdmin)) {
                adminEmails.push(rootAdmin);
            }
        }

        // NOVO: Adiciona o e-mail do autor da ação (logado) à lista de destinatários
        if (loggedUserEmail && !adminEmails.includes(loggedUserEmail)) {
            adminEmails.push(loggedUserEmail);
        }

        if (adminEmails.length === 0) {
            return NextResponse.json({ error: 'Nenhum destinatário administrador encontrado.' }, { status: 400 });
        }

        // Construir E-mail HTML elegante
        const dateBR = new Date().toLocaleDateString("pt-BR");
        let htmlContent = `
            <div style="font-family: Arial, sans-serif; color: #1f2937; max-width: 600px; margin: auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
                <div style="background-color: #166534; padding: 24px; text-align: center;">
                    <h2 style="color: #ffffff; margin: 0; font-size: 24px;">Relatório de Faltas Escolar</h2>
                    <p style="color: #dcfce7; margin: 8px 0 0 0; font-size: 14px;">Data de Referência: <strong>${dateBR}</strong></p>
                </div>
                
                <div style="padding: 32px 24px;">
        `;

        if (missingClasses.length > 0) {
            htmlContent += `
                    <div style="margin-bottom: 24px; padding: 16px; background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px;">
                        <h3 style="margin-top: 0; color: #991b1b; font-size: 16px;">
                            ⏳ Chamadas Pendentes
                        </h3>
                        <p style="margin: 0 0 12px 0; font-size: 14px; color: #7f1d1d;">
                            Atenção: Os seguintes professores/turmas ainda <strong>não lançaram</strong> a frequência hoje:
                        </p>
                        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            `;
            missingClasses.forEach(cls => {
                htmlContent += `<span style="background-color: #fee2e2; color: #991b1b; padding: 4px 8px; border-radius: 4px; font-size: 13px; font-weight: bold; border: 1px solid #f87171; display: inline-block;">Turma ${cls}</span> `;
            });
            htmlContent += `
                        </div>
                    </div>
            `;
        } else {
            htmlContent += `
                    <div style="margin-bottom: 24px; padding: 16px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px;">
                        <h3 style="margin-top: 0; color: #166534; font-size: 16px;">
                            ✅ Todas as chamadas concluídas!
                        </h3>
                        <p style="margin: 0; font-size: 14px; color: #15803d;">
                            Todos os diários previstos para hoje foram preenchidos com sucesso.
                        </p>
                    </div>
            `;
        }

        htmlContent += `
                    <p style="margin-top: 0; font-size: 16px; line-height: 1.5;">
                        Olá Direção / Coordenação,<br/><br/>
                        Abaixo estão listados os alunos que <strong>ausentaram-se</strong> hoje na E.E. Prof. Gabriel Pozzi e requerem acompanhamento da "Busca Ativa":
                    </p>
        `;

        const sortedClasses = Object.keys(absencesByClass).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

        if (sortedClasses.length === 0) {
            htmlContent += `<p style="color: #059669; font-weight: bold; padding: 16px; background: #ecfdf5; border-radius: 8px; border: 1px solid #a7f3d0;">Nenhuma falta foi registrada nas chamadas feitas até o momento.</p>`;
        } else {
            for (const studentClass of sortedClasses) {
                const students = absencesByClass[studentClass];
                htmlContent += `
                        <div style="margin-top: 24px; padding: 16px; background-color: #f9fafb; border-left: 4px solid #b91c1c; border-radius: 4px;">
                            <h3 style="color: #b91c1c; margin-top: 0; margin-bottom: 12px; font-size: 18px;">
                                Turma ${studentClass} <span style="font-size: 14px; font-weight: normal; color: #4b5563;">(${students.length} faltas)</span>
                            </h3>
                            <ul style="margin: 0; padding-left: 20px; color: #374151; font-size: 14px; line-height: 1.6;">
                `;

                // Ordenar por nome
                students.sort((a, b) => a.studentName.localeCompare(b.studentName)).forEach(student => {
                    const isHighAbsence = student.absenceRate >= 15;
                    htmlContent += `
                        <li style="margin-bottom: 4px;">
                            ${student.studentName} 
                            <span style="font-weight: bold; color: ${isHighAbsence ? '#b91c1c' : '#6b7280'};">
                                (${student.absenceRate}% de faltas)
                            </span>
                        </li>
                    `;
                });

                htmlContent += `</ul></div>`;
            }
        }

        htmlContent += `
                </div>
                <div style="background-color: #f3f4f6; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="font-size: 12px; color: #6b7280; margin: 0;">
                        Este é um e-mail automático gerado pelo <br/>
                        <strong>App de Chamada Escolar</strong>. Por favor, não responda.
                    </p>
                </div>
            </div>
        `;

        // Verificação de Variáveis de Ambiente Críticas
        const emailUser = process.env.EMAIL_USER;
        const emailPass = process.env.EMAIL_PASS;
        const emailHost = process.env.EMAIL_HOST || "smtp.gmail.com";
        const emailPort = Number(process.env.EMAIL_PORT) || 465;

        if (!emailUser || !emailPass) {
            console.error("ERRO: Variáveis EMAIL_USER ou EMAIL_PASS não configuradas.");
            return NextResponse.json({ error: 'Configuração de e-mail incompleta no servidor.' }, { status: 500 });
        }

        // Configuração do servidor de e-mail
        const transporter = nodemailer.createTransport({
            host: emailHost,
            port: emailPort,
            secure: emailPort === 465, 
            auth: {
                user: emailUser,
                pass: emailPass,
            },
            // Aumentar timeout para evitar falhas em conexões lentas
            connectionTimeout: 10000,
            greetingTimeout: 10000,
        });

        // Envio
        const mailOptions = {
            from: `"Busca Ativa EE Gabriel Pozzi" <${emailUser}>`,
            to: adminEmails.join(', '),
            subject: `🚨 Tabela de Faltas Diárias (${dateBR}) - Alunos para Contato`,
            html: htmlContent
        };

        console.log(`Tentando enviar e-mail para: ${adminEmails.join(', ')}`);
        const info = await transporter.sendMail(mailOptions);
        console.log(`E-mail enviado com sucesso: ${info.messageId}`);

        return NextResponse.json({
            message: 'Relatório construído e enviado com sucesso ao Administrador / Secretaria!',
            messageId: info.messageId,
            totalEmailsFound: adminEmails.length
        });
    } catch (error) {
        console.error("ERRO CRÍTICO no fluxo do Cron/Relatório:", error);
        return NextResponse.json({
            error: 'Falha interna ao preparar ou disparar o e-mail.',
            details: String(error)
        }, { status: 500 });
    }
}
