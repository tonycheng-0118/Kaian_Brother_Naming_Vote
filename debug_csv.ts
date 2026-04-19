import axios from 'axios';

const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRiPAZYD65-v-Qm0361dJIx-Nor-AuBgojoASrNr1AoYBTuDkte9rYyiel52TejL2lYQaMir_p2TDyD/pub?gid=781012340&single=true&output=csv';

async function debugCsv() {
  try {
    const response = await axios.get(CSV_URL);
    console.log("--- CSV RAW DATA (First 500 chars) ---");
    console.log(response.data.substring(0, 500));
    console.log("--- END RAW DATA ---");
    
    const lines = response.data.split('\n');
    console.log("Headers:", JSON.stringify(lines[0]));
    
    const jingRow = lines.find(l => l.startsWith('敬,') || l.startsWith('敬 '));
    console.log("Specific row for '敬':", JSON.stringify(jingRow));
    
    const allExcluded = lines.map(l => l.split(',')[5]?.trim()).filter(Boolean);
    console.log("First 10 excluded chars:", allExcluded.slice(0, 10));
    console.log("Is '敬' in the excluded column somewhere?", allExcluded.includes('敬'));
  } catch (error) {
    console.error("Error fetching CSV:", error);
  }
}

debugCsv();
