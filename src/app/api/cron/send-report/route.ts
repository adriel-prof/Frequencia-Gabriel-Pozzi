import { NextResponse } from 'next/server';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebaseConfig';
import nodemailer from 'nodemailer';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    // A rota agora pode ser disparada tanto por um Cron Job quanto pelo clique do Professor
    try {
        const today = new Date().toISOString().split("T")[0];
        const LOCK_DATE = "2026-04-06";

        // Buscar Chamadas a partir da data de corte para calcular porcentagens
        const attendanceRef = collection(db, "attendance");
        const q = query(attendanceRef, where("date", ">=", LOCK_DATE));
        const snapshot = await getDocs(q);

        // Agrupar faltosos por turma e registrar turmas concluídas
        type AttendanceDoc = { studentClass: string; studentId: number; studentName: string; status: string; date: string; };
        
        // Dados para o relatório de HOJE
        const absencesByClass: Record<string, { studentName: string; studentId: number; absenceRate: number }[]> = {};
        const completedClassesSet = new Set<string>();
        
        // Dados para calcular a porcentagem geral de cada aluno (reincidência)
        const studentStats: Record<number, { total: number; absences: number; name: string; class: string }> = {};

        snapshot.docs.forEach(doc => {
            const data = doc.data() as AttendanceDoc;
            
            // Registrar estatística geral do aluno
            if (!studentStats[data.studentId]) {
                studentStats[data.studentId] = { total: 0, absences: 0, name: data.studentName, class: data.studentClass };
            }
            studentStats[data.studentId].total += 1;
            if (data.status === "F") {
                studentStats[data.studentId].absences += 1;
            }

            // Ações específicas para registros de HOJE
            if (data.date === today) {
                completedClassesSet.add(data.studentClass);
            }
        });

        // Agora que temos todas as estatísticas, filtramos quem faltou HOJE para montar o relatório
        snapshot.docs.forEach(doc => {
            const data = doc.data() as AttendanceDoc;
            if (data.date === today && data.status === "F") {
                if (!absencesByClass[data.studentClass]) {
                    absencesByClass[data.studentClass] = [];
                }
                
                const stats = studentStats[data.studentId];
                const absenceRate = Math.round((stats.absences / stats.total) * 100);
                
                absencesByClass[data.studentClass].push({
                    studentName: data.studentName,
                    studentId: data.studentId,
                    absenceRate: absenceRate
                });
            }
        });


        // Buscar todas as turmas cadastradas nos alunos
        const studentsSnap = await getDocs(collection(db, "students"));
        const allClasses = Array.from(new Set(studentsSnap.docs.map(d => d.data().class as string))).sort();
        
        const missingClasses = allClasses.filter(cls => !completedClassesSet.has(cls));

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
            const rolesRef = collection(db, "roles");
            const rolesQuery = query(rolesRef, where("role", "==", "admin"));
            const rolesSnapshot = await getDocs(rolesQuery);
            const roleEmails = rolesSnapshot.docs.map(d => d.data().email);

            roleEmails.forEach(email => {
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

        const sortedClasses = Object.keys(absencesByClass).sort();

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

        // Configuração do servidor de e-mail
        const port = Number(process.env.EMAIL_PORT) || 587;
        const transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST || "smtp.office365.com",
            port: port,
            secure: port === 465, // true para porta 465 (autenticação SSL)
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        // Envio
        const mailOptions = {
            from: `"Busca Ativa EE Gabriel Pozzi" <${process.env.EMAIL_USER}>`,
            to: adminEmails.join(', '),
            subject: `🚨 Tabela de Faltas Diárias (${dateBR}) - Alunos para Contato`,
            html: htmlContent
        };

        const info = await transporter.sendMail(mailOptions);

        return NextResponse.json({
            message: 'Relatório construído e enviado com sucesso ao Administrador / Secretaria!',
            messageId: info.messageId,
            totalEmailsFound: adminEmails.length
        });
    } catch (error) {
        console.error("Erro no fluxo do Cron:", error);
        return NextResponse.json({
            error: 'Falha interna ao preparar ou disparar o e-mail.',
            details: String(error)
        }, { status: 500 });
    }
}
