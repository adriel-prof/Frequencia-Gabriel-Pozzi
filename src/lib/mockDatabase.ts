// Serviço de Simulação Local (Mock Database) via LocalStorage
// Fornece um banco de dados persistente no navegador para desenvolvimento local offline

export type MockStudent = {
    firestoreId: string;
    id: number;
    name: string;
    class: string;
    status?: string;
};

export type MockAttendance = {
    id: string; // formato: att_firestoreId_YYYY-MM-DD
    studentFirestoreId: string;
    studentId: number;
    studentName: string;
    studentClass: string;
    status: "P" | "F" | "D" | "A" | "TR";
    date: string;
    teacher: string;
};

// 1. Roster inicial de estudantes reais (alta fidelidade extraída do Firestore de produção)
const INITIAL_STUDENTS: MockStudent[] = [
    // --- 1°A (36 alunos) ---
    { firestoreId: "00wVuTpJCfs64ZredI4l", id: 1, name: "ALLAN HENRIQUE SILVA", class: "1°A" },
    { firestoreId: "gWqX9JUDavyvZ61inE2y", id: 2, name: "ANA CAROLINA PEROZZO RAMOS", class: "1°A" },
    { firestoreId: "MoNVytp7mD5lMtBUsd2V", id: 6, name: "ANDREW OTÁVIO CIRQUEIRA", class: "1°A" },
    { firestoreId: "Hv74jscue7KtG2sbgyAj", id: 9, name: "BIANCA HELOISE GONCALVES LIMA", class: "1°A" },
    { firestoreId: "m0SgJmUHpKkCFdOHNm7r", id: 10, name: "BRYAN GABRIEL LEAL", class: "1°A" },
    { firestoreId: "1bfqz6icreN0F64Xotmr", id: 11, name: "BRYAN TOMAZIN DE FARIAS", class: "1°A" },
    { firestoreId: "U7Df0JEEK7yi2nz1LqIe", id: 12, name: "DERIK WENDEL DA SILVA", class: "1°A" },
    { firestoreId: "O1C5GoV6fehCBtfHSe5g", id: 13, name: "EDUARDO MAGALHÃES TEODORO", class: "1°A" },
    { firestoreId: "IXtiEpPB9VuzVBb27rOY", id: 14, name: "EMILLY NICOLY BARBOSA", class: "1°A" },
    { firestoreId: "T2Rwjro1qml55ePNIPKa", id: 17, name: "ENZO CAETANO MASSARI", class: "1°A" },
    { firestoreId: "XftLWnB31TnooJovloSp", id: 18, name: "FELIPE GUSTAVO MARQUES DE LIMA", class: "1°A" },
    { firestoreId: "K0voKK9YEr0ml4qLisTH", id: 20, name: "GIOVANA SEPULVIDA DA SILVA", class: "1°A" },
    { firestoreId: "XV7LhNBdPJuNhlHR7FAs", id: 21, name: "GIOVANNA LAUREN DA SILVA DIBER", class: "1°A" },
    { firestoreId: "NA6BceQW6AfwV3vH0Goj", id: 23, name: "GUILHERME LIMA BORGES", class: "1°A" },
    { firestoreId: "OntQix9gBSemvweVwGga", id: 25, name: "HEITOR ALVES AMANCIO JULIO", class: "1°A" },
    { firestoreId: "Bjk5lmRyE3U1sJwN0bWi", id: 29, name: "JASMIM KAUANA BASILIO", class: "1°A" },
    { firestoreId: "3NqsUAUaqJQyB2ythVsS", id: 30, name: "JOÃO VITOR BARBIERI CARVALHO", class: "1°A" },
    { firestoreId: "zbru5kVD0i3VKlTUPOv2", id: 31, name: "JOEL MODESTO DA SILVA NETO", class: "1°A" },
    { firestoreId: "ZFcnhdkvnB13rUb0NXQk", id: 33, name: "JULIA FATORETTO", class: "1°A" },
    { firestoreId: "9itlFScR4MqcyJEo85Tz", id: 34, name: "JULIA FAUSTINO", class: "1°A" },
    { firestoreId: "F4BCaDM0RFm0BmIcbo4P", id: 35, name: "JULIA FREITAS DOS SANTOS", class: "1°A" },
    { firestoreId: "7NQErHnzRp8lneG38jIo", id: 36, name: "KASSIANA CARDOSO BORGES", class: "1°A" },
    { firestoreId: "IvHcVEkCw0r4grfsLP4f", id: 37, name: "LAURA LEAL", class: "1°A" },
    { firestoreId: "yF5lEYtKWR7FiCUThm3s", id: 38, name: "LETHICIA EMANUELY PERES DE CARVALHO", class: "1°A" },
    { firestoreId: "xUZCdwoDi2iJ3kb0N5V1", id: 42, name: "MARIA ISABELLE FERREIRA DOS SANTOS", class: "1°A" },
    { firestoreId: "hlhKR3uq1pTftfmhF6BX", id: 44, name: "MATEUS DE MELO BENEDICTO", class: "1°A" },
    { firestoreId: "Zci2rwfb6SamcgzzHTC3", id: 45, name: "MATHEUS SCHNOOR PRADO", class: "1°A" },
    { firestoreId: "pVlOMoBcsMKi6L595MF3", id: 48, name: "PEDRO DOS SANTOS CATALINI", class: "1°A" },
    { firestoreId: "eOMQ0LuMIOgbKhdUMK3C", id: 49, name: "PEDRO HENRIQUE ARANTES DA SILVA", class: "1°A" },
    { firestoreId: "LN4yN1Is0SRS3nvn0l7D", id: 50, name: "PEDRO HENRIQUE PERBONI", class: "1°A" },
    { firestoreId: "KC2516aA2AaNA3xiaVzn", id: 51, name: "PEDRO NAIDHIG", class: "1°A" },
    { firestoreId: "mYPXDfeb2umjgtvZmMb4", id: 54, name: "RAFAEL PEREIRA", class: "1°A" },
    { firestoreId: "r2Lab1WzGDninDUQss34", id: 55, name: "RAFAELA CARVALHO MACHADO", class: "1°A" },
    { firestoreId: "zF2HH7WX3h6oy46YEUZk", id: 56, name: "RAFAELA VITOR FERREIRA", class: "1°A" },
    { firestoreId: "yopGP0DrzMirK9qGmM87", id: 58, name: "SILAS COSTA GOMES SILVA", class: "1°A" },
    { firestoreId: "VXhWRiqI36o61sxUGYIt", id: 59, name: "VALENTINA GARCIA BOSQUEIRO", class: "1°A" },

    // --- 1°B (40 alunos) ---
    { firestoreId: "1B_1", id: 1, name: "ANA CLARA GOMES DAMACENO", class: "1°B" },
    { firestoreId: "1B_2", id: 2, name: "ANA JÚLIA DE QUEIROZ DA SILVA", class: "1°B" },
    { firestoreId: "1B_3", id: 3, name: "BEATRIZ DE GOES FERMINO", class: "1°B" },
    { firestoreId: "1B_4", id: 4, name: "BERNARDO RIZZO BENTO", class: "1°B" },
    { firestoreId: "1B_6", id: 6, name: "CATHARINA ZOVICO STRADIOTTO E SOUZA", class: "1°B" },
    { firestoreId: "1B_7", id: 7, name: "CAUÃ DE OLIVEIRA MARSAL", class: "1°B" },
    { firestoreId: "1B_8", id: 8, name: "CRISTIANE SANTOS CAMPOS", class: "1°B" },
    { firestoreId: "1B_9", id: 9, name: "ELOÁ PEREIRA CANDIDO", class: "1°B" },
    { firestoreId: "1B_10", id: 10, name: "EMANUELLY DONA DOS SANTOS FERREIRA", class: "1°B" },
    { firestoreId: "1B_16", id: 16, name: "FERNANDA FERNANDES DE PADUA", class: "1°B" },
    { firestoreId: "1B_17", id: 17, name: "GABRIEL DO CARMO BENTO", class: "1°B" },
    { firestoreId: "1B_20", id: 20, name: "GUSTAVO ARAUJO DE MORAIS", class: "1°B" },
    { firestoreId: "67npuxCwpNWR5Rdcoczj", id: 21, name: "HELOA VITORIA PEREIRA DA SILVA", class: "1°B" },
    { firestoreId: "h3Ngl5o5deiuqOzKu4Tb", id: 22, name: "ISABELLA SAO PEDRO RAMOS", class: "1°B" },
    { firestoreId: "1B_27", id: 27, name: "KAMILLY VITORIA SMITH AMARILHA", class: "1°B" },
    { firestoreId: "1B_28", id: 28, name: "KAUÊ PINHEIRO LOURENÇO", class: "1°B" },
    { firestoreId: "1B_29", id: 29, name: "KAUÊ RISSOTTI AGUIAR", class: "1°B" },
    { firestoreId: "1B_30", id: 30, name: "KAYO ROCHA RIBEIRO", class: "1°B" },
    { firestoreId: "1B_32", id: 32, name: "LAYLA RAMILLY CORDEIRO DIAS", class: "1°B" },
    { firestoreId: "1B_34", id: 34, name: "LUIZ HENRIQUE GREGO SODRÉ", class: "1°B" },
    { firestoreId: "1B_37", id: 37, name: "MANUELA VICTÓRIA DOS SANTOS MAIA", class: "1°B" },
    { firestoreId: "1B_39", id: 39, name: "MARIA EDUARDA TONON DA SILVA", class: "1°B" },
    { firestoreId: "1B_40", id: 40, name: "MARIANA MORILHA MONTEIRO", class: "1°B" },
    { firestoreId: "1B_41", id: 41, name: "MATHEUS CABAL DIAS SAHM PAGGIARO DIAS", class: "1°B" },
    { firestoreId: "1B_45", id: 45, name: "PEDRO HENRIQUE GOMES", class: "1°B" },
    { firestoreId: "1B_46", id: 46, name: "RAYANNY AMORIM DA SILVA", class: "1°B" },
    { firestoreId: "1B_47", id: 47, name: "RAYSSA AMORIM DA SILVA", class: "1°B" },
    { firestoreId: "1B_48", id: 48, name: "RENNAN MAILSON ALVES MIMOSA", class: "1°B" },
    { firestoreId: "1B_50", id: 50, name: "ROSÂNGELA HELENA FERREIRA CIRINO NOIMA", class: "1°B" },
    { firestoreId: "e6MnKOA7PZFTLXsq27Qh", id: 51, name: "RUAN RODRIGUES", class: "1°B" },
    { firestoreId: "1B_52", id: 52, name: "SAMUEL GATTI VICENTE", class: "1°B" },
    { firestoreId: "1B_53", id: 53, name: "STEFANY BIANCA DUARTE ALVARENGA", class: "1°B" },
    { firestoreId: "1B_54", id: 54, name: "STHEFANY FERREIRA DIAS", class: "1°B" },
    { firestoreId: "1B_56", id: 56, name: "THALES XAVIER", class: "1°B" },
    { firestoreId: "1B_57", id: 57, name: "VICTOR HUGO DA SILVA", class: "1°B" },
    { firestoreId: "1B_58", id: 58, name: "VINICIUS DE OLIVEIRA ASTUM", class: "1°B" },
    { firestoreId: "6sZFPyas3bzz04SEGyjn", id: 59, name: "VINICIUS GUILHERME JACINTO DE ANDRADE", class: "1°B" },
    { firestoreId: "1B_60", id: 60, name: "WESLEY FERNANDO DE AGUIAR DOMINGOS", class: "1°B" },
    { firestoreId: "1B_61", id: 61, name: "YAN ROGER FERREIRA CIRINO NOIMA", class: "1°B" },
    { firestoreId: "1B_62", id: 62, name: "YASMIM GABRIELLI FARIAS BARBOSA", class: "1°B" }
];

// Alunos pré-configurados com Dispensa Médica na simulação local
const INITIAL_DISPENSED = ["U7Df0JEEK7yi2nz1LqIe", "6sZFPyas3bzz04SEGyjn"]; // Derik (1°A) e Vinicius (1°B)

const STORAGE_KEYS = {
    STUDENTS: "mock_students",
    ATTENDANCE: "mock_attendance",
    DISPENSED: "mock_dispensed"
};

// Helpers para acesso ao LocalStorage com tratamento de ambiente SSR (Next.js)
const isBrowser = typeof window !== "undefined";

function getFromStorage<T>(key: string, defaultValue: T): T {
    if (!isBrowser) return defaultValue;
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
        console.error(`Erro ao ler do localStorage[${key}]:`, e);
        return defaultValue;
    }
}

function setToStorage<T>(key: string, value: T): void {
    if (!isBrowser) return;
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.error(`Erro ao escrever no localStorage[${key}]:`, e);
    }
}

// 2. Inicialização do Banco de Dados Local
export function initializeMockDatabase(forceReset = false): void {
    if (!isBrowser) return;
    
    const studentsExist = localStorage.getItem(STORAGE_KEYS.STUDENTS);
    if (!studentsExist || forceReset) {
        setToStorage(STORAGE_KEYS.STUDENTS, INITIAL_STUDENTS);
    }

    const dispensedExists = localStorage.getItem(STORAGE_KEYS.DISPENSED);
    if (!dispensedExists || forceReset) {
        setToStorage(STORAGE_KEYS.DISPENSED, INITIAL_DISPENSED);
    }

    const attendanceExists = localStorage.getItem(STORAGE_KEYS.ATTENDANCE);
    if (!attendanceExists || forceReset) {
        setToStorage(STORAGE_KEYS.ATTENDANCE, [] as MockAttendance[]);
    }
}

// 3. API do Banco Mockado Local
export const mockDb = {
    // ESTUDANTES
    getStudents: (): MockStudent[] => {
        initializeMockDatabase();
        return getFromStorage<MockStudent[]>(STORAGE_KEYS.STUDENTS, INITIAL_STUDENTS);
    },

    saveStudent: (student: Omit<MockStudent, "firestoreId"> & { firestoreId?: string }): MockStudent => {
        initializeMockDatabase();
        const students = getFromStorage<MockStudent[]>(STORAGE_KEYS.STUDENTS, INITIAL_STUDENTS);
        
        const firestoreId = student.firestoreId || `mock_stud_${Math.random().toString(36).substring(2, 11)}`;
        const newStudent = { ...student, firestoreId } as MockStudent;

        const index = students.findIndex(s => s.firestoreId === firestoreId);
        if (index >= 0) {
            students[index] = newStudent;
        } else {
            students.push(newStudent);
        }

        setToStorage(STORAGE_KEYS.STUDENTS, students);
        return newStudent;
    },

    deleteStudent: (firestoreId: string): void => {
        initializeMockDatabase();
        let students = getFromStorage<MockStudent[]>(STORAGE_KEYS.STUDENTS, INITIAL_STUDENTS);
        students = students.filter(s => s.firestoreId !== firestoreId);
        setToStorage(STORAGE_KEYS.STUDENTS, students);

        // Deleta histórico de presenças atrelado
        let attendance = getFromStorage<MockAttendance[]>(STORAGE_KEYS.ATTENDANCE, []);
        attendance = attendance.filter(a => a.studentFirestoreId !== firestoreId);
        setToStorage(STORAGE_KEYS.ATTENDANCE, attendance);
    },

    // DISPENSAS MÉDICAS
    getDispensedStudents: (): Set<string> => {
        initializeMockDatabase();
        const list = getFromStorage<string[]>(STORAGE_KEYS.DISPENSED, INITIAL_DISPENSED);
        return new Set(list);
    },

    addDispensation: (firestoreId: string): void => {
        initializeMockDatabase();
        const list = getFromStorage<string[]>(STORAGE_KEYS.DISPENSED, INITIAL_DISPENSED);
        if (!list.includes(firestoreId)) {
            list.push(firestoreId);
            setToStorage(STORAGE_KEYS.DISPENSED, list);
        }
    },

    removeDispensation: (firestoreId: string): void => {
        initializeMockDatabase();
        let list = getFromStorage<string[]>(STORAGE_KEYS.DISPENSED, INITIAL_DISPENSED);
        list = list.filter(id => id !== firestoreId);
        setToStorage(STORAGE_KEYS.DISPENSED, list);
    },

    // CHAMADAS / PRESENÇA (ATTENDANCE)
    getAttendance: (date?: string): MockAttendance[] => {
        initializeMockDatabase();
        const records = getFromStorage<MockAttendance[]>(STORAGE_KEYS.ATTENDANCE, []);
        if (date) {
            return records.filter(r => r.date === date);
        }
        return records;
    },

    saveAttendanceBatch: (newRecords: Omit<MockAttendance, "id">[]): void => {
        initializeMockDatabase();
        const records = getFromStorage<MockAttendance[]>(STORAGE_KEYS.ATTENDANCE, []);
        
        newRecords.forEach(rec => {
            const id = `att_${rec.studentFirestoreId}_${rec.date}`;
            const fullRecord = { ...rec, id } as MockAttendance;
            
            const index = records.findIndex(r => r.id === id);
            if (index >= 0) {
                records[index] = fullRecord;
            } else {
                records.push(fullRecord);
            }
        });

        setToStorage(STORAGE_KEYS.ATTENDANCE, records);
    },

    clearDatabase: (): void => {
        initializeMockDatabase(true);
    }
};
