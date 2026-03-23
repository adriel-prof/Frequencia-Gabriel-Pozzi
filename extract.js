const xlsx = require("xlsx");
const path = require("path");

try {
    const filePath = path.join(__dirname, "../App Chamada.xlsx");
    const workbook = xlsx.readFile(filePath);
    const result = [];

    workbook.SheetNames.forEach(sheetName => {
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

        // Assumindo que a planilha tem cabeçalho, procuramos as linhas onde a primeira coluna é número
        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            if (row && row.length >= 2 && !isNaN(parseInt(row[0]))) {
                result.push({
                    id: parseInt(row[0]),
                    name: String(row[1] || '').trim(),
                    class: sheetName.trim()
                });
            }
        }
    });

    console.log(JSON.stringify(result, null, 2));
} catch (error) {
    console.error("Erro ao ler:", error);
}
