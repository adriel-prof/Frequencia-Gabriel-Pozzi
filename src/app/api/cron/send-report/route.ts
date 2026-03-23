import { NextResponse } from 'next/server';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebaseConfig';
import nodemailer from 'nodemailer';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    // A rota agora pode ser disparada tanto por um Cron Job quanto pelo clique do Professor
    try {
        const today = new Date().toISOString().split("T")[0];

        // Buscar apenas FALTAS (status = "F") do dia atual
        const attendanceRef = collection(db, "attendance");
        const q = query(attendanceRef, where("date", "==", today), where("status", "==", "F"));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            return NextResponse.json({ message: 'Nenhuma falta registrada hoje.' });
        }

        // Agrupar faltosos por turma
        type AbsenceData = { studentClass: string; studentId: number; studentName: string; status: string; };
        const absencesByClass: Record<string, AbsenceData[]> = {};
        snapshot.docs.forEach(doc => {
            const data = doc.data() as AbsenceData;
            if (!absencesByClass[data.studentClass]) {
                absencesByClass[data.studentClass] = [];
            }
            absencesByClass[data.studentClass].push(data);
        });

        // Buscar admins para enviar e-mail
        const adminEmails: string[] = [];

        const { searchParams } = new URL(request.url);
        const targetEmail = searchParams.get('email');
        const loggedUserEmail = searchParams.get('loggedUserEmail');

        if (targetEmail) {
            // Se o usuário especificou um e-mail lá no Dashboard, manda SÓ PRA ELE (mas também inclui o logado depois)
            adminEmails.push(targetEmail);
        } else {
            // Comportamento normal automático: Busca os e-mails configurados no Firestore + Admins Base

            // 1. Busca da aba de configurações (Settings)
            const settingsDoc = await getDoc(doc(db, "settings", "attendance"));
            if (settingsDoc.exists() && settingsDoc.data().reportEmails) {
                const configEmails = settingsDoc.data().reportEmails.split(',').map((e: string) => e.trim()).filter(Boolean);
                adminEmails.push(...configEmails);
            }

            // 2. Busca dos Professores promovidos a 'Admin'
            const rolesRef = collection(db, "roles");
            const rolesQuery = query(rolesRef, where("role", "==", "admin"));
            const rolesSnapshot = await getDocs(rolesQuery);
            const roleEmails = rolesSnapshot.docs.map(d => d.data().email);

            roleEmails.forEach(email => {
                if (!adminEmails.includes(email)) adminEmails.push(email);
            });

            // 3. Garante que o Admin raiz não fique de fora
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
                    <p style="margin-top: 0; font-size: 16px; line-height: 1.5;">
                        Olá Direção / Coordenação,<br/><br/>
                        Abaixo estão listados os alunos que <strong>ausentaram-se</strong> hoje na E.E. Prof. Gabriel Pozzi e requerem acompanhamento da "Busca Ativa":
                    </p>
        `;

        const sortedClasses = Object.keys(absencesByClass).sort();

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
                htmlContent += `<li>${student.studentName}</li>`;
            });
            htmlContent += `</ul></div>`;
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
