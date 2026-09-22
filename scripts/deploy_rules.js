const fs = require('fs');
const path = require('path');
const { GoogleAuth } = require('google-auth-library');

const keyPath = path.join(__dirname, '..', '..', 'frequencia-gabriel-pozzi-firebase-adminsdk-fbsvc-6e0d943a06.json');
const rulesPath = path.join(__dirname, '..', 'firestore.rules');

async function deployRules() {
    console.log("Lendo arquivo firestore.rules...");
    const rulesContent = fs.readFileSync(rulesPath, 'utf8');

    console.log("Autenticando via Service Account...");
    const auth = new GoogleAuth({
        keyFile: keyPath,
        scopes: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/firebase']
    });

    const client = await auth.getClient();
    const projectId = "frequencia-gabriel-pozzi";

    console.log("1. Criando novo Ruleset no Firebase Rules API...");
    const createRulesetUrl = `https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`;
    const rulesetRes = await client.request({
        url: createRulesetUrl,
        method: 'POST',
        data: {
            source: {
                files: [
                    {
                        name: "firestore.rules",
                        content: rulesContent
                    }
                ]
            }
        }
    });

    const rulesetName = rulesetRes.data.name;
    console.log(`Ruleset criado com sucesso: ${rulesetName}`);

    console.log("2. Atualizando a release 'cloud.firestore' para o novo ruleset...");
    const releaseUrl = `https://firebaserules.googleapis.com/v1/projects/${projectId}/releases/cloud.firestore`;
    const releaseRes = await client.request({
        url: releaseUrl,
        method: 'PATCH',
        data: {
            release: {
                name: `projects/${projectId}/releases/cloud.firestore`,
                rulesetName: rulesetName
            }
        }
    });

    console.log("✅ Regras publicadas e ativas no Cloud Firestore com SUCESSO!", releaseRes.data);
}

deployRules().catch(err => {
    console.error("ERRO ao publicar regras via API:", err.response ? err.response.data : err);
    process.exit(1);
});
