"use client";

import { useState } from "react";
import { collection, writeBatch, doc } from "firebase/firestore";
import { db } from "@/lib/firebaseConfig";
import Papa from "papaparse";

type CSVRow = {
    id: string | number;
    nome: string;
    turma: string;
} | string[];

export default function ImportPage() {
    const [file, setFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [feedback, setFeedback] = useState<{ type: "success" | "error", msg: string } | null>(null);
    const [preview, setPreview] = useState<{ id: string | number, name: string, class: string }[]>([]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFeedback(null);
        if (e.target.files && e.target.files.length > 0) {
            const selected = e.target.files[0];
            setFile(selected);

            Papa.parse(selected, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    const parsedData: { id: string | number, name: string, class: string }[] = [];
                    results.data.forEach((row: any) => {
                        let id: any = null;
                        let name: any = null;
                        let turma: any = null;

                        // Varre todas as colunas recebidas limpando caracteres invisíveis (como BOM gerado pelo Excel)
                        for (const rawKey of Object.keys(row)) {
                            const cleanKey = rawKey.replace(/[\uFEFF\u200B\u200D]/g, '').trim().toLowerCase();

                            if (cleanKey === 'id' || cleanKey === 'numero' || cleanKey === 'num' || cleanKey === 'nº') {
                                id = row[rawKey];
                            } else if (cleanKey === 'nome' || cleanKey === 'name' || cleanKey === 'aluno') {
                                name = row[rawKey];
                            } else if (cleanKey === 'turma' || cleanKey === 'class' || cleanKey === 'classe' || cleanKey === 'serie' || cleanKey === 'série') {
                                turma = row[rawKey];
                            }
                        }

                        if (id && name && turma) {
                            parsedData.push({ id: Number(id), name: String(name).trim(), class: String(turma).trim() });
                        }
                    });

                    if (parsedData.length > 0) {
                        setPreview(parsedData);
                        setFeedback({ type: "success", msg: `Planilha válida! ${parsedData.length} alunos encontrados.` });
                    } else {
                        setPreview([]);
                        setFeedback({ type: "error", msg: "As colunas não foram reconhecidas. Certifique-se de ter cabeçalhos como: id, nome, e turma." });
                    }
                },
                error: (error) => {
                    console.error("Erro ao analisar CSV:", error);
                    setFeedback({ type: "error", msg: "Erro ao ler o arquivo CSV." });
                }
            });
        }
    };

    const handleUpload = async () => {
        if (preview.length === 0) return;

        setIsUploading(true);
        setFeedback(null);

        try {
            const batch = writeBatch(db);
            let count = 0;

            for (const student of preview) {
                // Remove espaços e caracteres especiais da turma para criar um prefixo na chave primaria
                const classKey = student.class.replace(/[^a-zA-Z0-9]/g, '');
                const docId = classKey + "_" + student.id;

                const docRef = doc(collection(db, "students"), docId);
                batch.set(docRef, {
                    id: student.id,
                    name: student.name,
                    class: student.class
                });

                count++;

                // Firestore limit is 500 per batch. For this demo we assume < 500 rows.
            }

            await batch.commit();
            setFeedback({ type: "success", msg: `${count} estudantes salvos no banco de dados com sucesso!` });
            setPreview([]);
            setFile(null);
        } catch (error) {
            console.error(error);
            setFeedback({ type: "error", msg: "Falha na sincronização com o banco de dados." });
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h2 className="text-xl font-bold text-gray-900 mb-2">Importação de Turmas</h2>
                <p className="text-gray-500 text-sm mb-6">Importe novos alunos para o banco de dados usando um arquivo CSV contendo os cabeçalhos <strong>id, nome, turma</strong>.</p>

                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                    <input
                        type="file"
                        accept=".csv"
                        onChange={handleFileChange}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-3 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-green-50 file:text-green-700 hover:file:bg-green-100 transition-all border border-gray-200 rounded-xl cursor-pointer bg-gray-50"
                    />
                </div>

                {feedback && (
                    <div className={`p-4 rounded-xl text-sm font-medium mb-6 ${feedback.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                        {feedback.msg}
                    </div>
                )}

                <button
                    disabled={preview.length === 0 || isUploading}
                    onClick={handleUpload}
                    className="w-full sm:w-auto px-6 py-3 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                >
                    {isUploading ? (
                        <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full block"></span>
                    ) : (
                        "Sincronizar com Banco de Dados"
                    )}
                </button>
            </div>

            {preview.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                        <h3 className="font-bold text-gray-900">Prévia da Leitura</h3>
                        <span className="text-sm font-medium text-gray-500">{preview.length} Registros</span>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="text-gray-500 border-b border-gray-100 sticky top-0 bg-white shadow-sm">
                                <tr>
                                    <th className="px-6 py-3 font-medium">Turma</th>
                                    <th className="px-6 py-3 font-medium">Nº</th>
                                    <th className="px-6 py-3 font-medium">Nome do Aluno</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {preview.slice(0, 50).map((s, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-3 font-medium text-gray-900">{s.class}</td>
                                        <td className="px-6 py-3 text-gray-500">{s.id}</td>
                                        <td className="px-6 py-3">{s.name}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {preview.length > 50 && (
                            <div className="p-4 text-center text-sm text-gray-500 border-t border-gray-100 bg-gray-50/50">
                                Mostrando apenas os primeiros 50 registros. Total lido: {preview.length}.
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
