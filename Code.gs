// ============================================================
// מנהל מאמץ מנהל — Google Apps Script Backend
// ============================================================

const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE'; // ← הכנס את ה-ID של ה-Sheet שלך
const ADMIN_PASSWORD = 'admin2025'; // ← שנה לסיסמה חזקה

// ============================================================
// MAIN ROUTER — כל בקשות POST/GET מגיעות לכאן
// ============================================================

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', message: 'API is running' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    let result;

    switch (action) {
      case 'login':           result = handleLogin(body); break;
      case 'getParticipant':  result = handleGetParticipant(body); break;
      case 'saveSession':     result = handleSaveSession(body); break;
      case 'getSession':      result = handleGetSession(body); break;
      case 'getAllSessions':  result = handleGetAllSessions(body); break;
      case 'adminLogin':      result = handleAdminLogin(body); break;
      case 'adminGetAll':     result = handleAdminGetAll(body); break;
      case 'adminGetResponses': result = handleAdminGetResponses(body); break;
      case 'adminAddParticipant': result = handleAdminAddParticipant(body); break;
      case 'adminExport':     result = handleAdminExport(body); break;
      case 'getParticipantNames': result = handleGetParticipantNames(); break;
      default: result = { success: false, error: 'Unknown action' };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// PARTICIPANT AUTH
// ============================================================

function handleLogin(body) {
  const { accessCode } = body;
  if (!accessCode) return { success: false, error: 'קוד גישה חסר' };

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Participants');
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === accessCode.toUpperCase()) {
      return {
        success: true,
        participant: {
          participantId: data[i][0],
          accessCode: data[i][1],
          fullName: data[i][2],
          role: data[i][3],
          organization: data[i][4],
          partnerName: data[i][5],
          partnerRole: data[i][6]
        }
      };
    }
  }
  return { success: false, error: 'קוד גישה שגוי' };
}

function handleGetParticipant(body) {
  return handleLogin(body);
}

// ============================================================
// GET PARTICIPANT NAMES (no auth required — names only)
// ============================================================

function handleGetParticipantNames() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Participants');
  const data = sheet.getDataRange().getValues();
  
  const names = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][2]) { // fullName exists
      names.push({
        accessCode: data[i][1],
        fullName: data[i][2],
        organization: data[i][4] || ''
      });
    }
  }
  // Sort alphabetically by name
  names.sort((a, b) => a.fullName.localeCompare(b.fullName, 'he'));
  return { success: true, names };
}

// ============================================================
// SESSION RESPONSES
// ============================================================

function handleSaveSession(body) {
  const { accessCode, sessionNumber, data: sessionData } = body;
  if (!accessCode || !sessionNumber) return { success: false, error: 'נתונים חסרים' };

  // Validate participant
  const loginResult = handleLogin({ accessCode });
  if (!loginResult.success) return loginResult;

  const participant = loginResult.participant;
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Responses');
  const allData = sheet.getDataRange().getValues();
  
  const now = new Date().toISOString();
  const rowData = buildResponseRow(participant, sessionNumber, sessionData, now);

  // Check if row exists
  for (let i = 1; i < allData.length; i++) {
    if (allData[i][0] === participant.participantId && allData[i][8] === sessionNumber) {
      // Update existing row
      const range = sheet.getRange(i + 1, 1, 1, rowData.length);
      range.setValues([rowData]);
      return { success: true, message: 'עודכן בהצלחה', updatedAt: now };
    }
  }

  // Append new row
  sheet.appendRow(rowData);
  return { success: true, message: 'נשמר בהצלחה', createdAt: now };
}

function handleGetSession(body) {
  const { accessCode, sessionNumber } = body;
  const loginResult = handleLogin({ accessCode });
  if (!loginResult.success) return loginResult;

  const participant = loginResult.participant;
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Responses');
  const allData = sheet.getDataRange().getValues();
  const headers = allData[0];

  for (let i = 1; i < allData.length; i++) {
    if (allData[i][0] === participant.participantId && allData[i][8] === sessionNumber) {
      const row = {};
      headers.forEach((h, idx) => { row[h] = allData[i][idx]; });
      return { success: true, data: row };
    }
  }
  return { success: true, data: null }; // No data yet
}

function handleGetAllSessions(body) {
  const { accessCode } = body;
  const loginResult = handleLogin({ accessCode });
  if (!loginResult.success) return loginResult;

  const participant = loginResult.participant;
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Responses');
  const allData = sheet.getDataRange().getValues();
  const headers = allData[0];

  const sessions = {};
  for (let i = 1; i < allData.length; i++) {
    if (allData[i][0] === participant.participantId) {
      const row = {};
      headers.forEach((h, idx) => { row[h] = allData[i][idx]; });
      sessions[allData[i][8]] = row;
    }
  }
  return { success: true, sessions };
}

// ============================================================
// ADMIN
// ============================================================

function handleAdminLogin(body) {
  if (body.password === ADMIN_PASSWORD) {
    return { success: true, token: 'admin_' + Utilities.base64Encode(new Date().getTime().toString()) };
  }
  return { success: false, error: 'סיסמה שגויה' };
}

function handleAdminGetAll(body) {
  if (!validateAdmin(body)) return { success: false, error: 'Unauthorized' };

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const pSheet = ss.getSheetByName('Participants');
  const rSheet = ss.getSheetByName('Responses');

  const participants = sheetToObjects(pSheet);
  const responses = sheetToObjects(rSheet);

  // Build completion map
  const completionMap = {};
  responses.forEach(r => {
    if (!completionMap[r.participantId]) {
      completionMap[r.participantId] = { 1: false, 2: false, 3: false, 4: false, 5: false };
    }
    if (r.isSubmitted === 'TRUE' || r.isSubmitted === true) {
      completionMap[r.participantId][r.sessionNumber] = true;
    } else {
      completionMap[r.participantId][r.sessionNumber] = 'draft';
    }
  });

  const enriched = participants.map(p => ({
    ...p,
    completion: completionMap[p.participantId] || {}
  }));

  return { success: true, participants: enriched };
}

function handleAdminGetResponses(body) {
  if (!validateAdmin(body)) return { success: false, error: 'Unauthorized' };

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Responses');
  const responses = sheetToObjects(sheet);

  // Optional filters
  const { participantId, sessionNumber, searchQuery } = body;
  let filtered = responses;

  if (participantId) filtered = filtered.filter(r => r.participantId === participantId);
  if (sessionNumber) filtered = filtered.filter(r => r.sessionNumber == sessionNumber);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(r =>
      JSON.stringify(r).toLowerCase().includes(q)
    );
  }

  return { success: true, responses: filtered };
}

function handleAdminAddParticipant(body) {
  if (!validateAdmin(body)) return { success: false, error: 'Unauthorized' };

  const { fullName, role, organization, partnerName, partnerRole } = body;
  if (!fullName) return { success: false, error: 'שם חסר' };

  const participantId = 'P' + new Date().getTime();
  const accessCode = generateCode();

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Participants');
  sheet.appendRow([participantId, accessCode, fullName, role || '', organization || '', partnerName || '', partnerRole || '', new Date().toISOString()]);

  return { success: true, participantId, accessCode };
}

function handleAdminExport(body) {
  if (!validateAdmin(body)) return { success: false, error: 'Unauthorized' };

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const pSheet = ss.getSheetByName('Participants');
  const rSheet = ss.getSheetByName('Responses');

  return {
    success: true,
    participants: sheetToObjects(pSheet),
    responses: sheetToObjects(rSheet),
    exportedAt: new Date().toISOString()
  };
}

// ============================================================
// HELPERS
// ============================================================

function validateAdmin(body) {
  // Simple token check — in production use a more robust method
  return body.token && body.token.startsWith('admin_');
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function buildResponseRow(participant, sessionNumber, d, now) {
  const sessionTitles = {
    1: 'תרבות ארגונית וניהול מבוסס ערכים',
    2: 'חדשנות טכנולוגית ככלי ניהולי',
    3: 'ניהול פרויקטים בשיטה שיתופית',
    4: 'ניהול משברים וקבלת החלטות תחת לחץ',
    5: 'יצירת שותפויות, מיתוג וחשיבה עסקית בחינוך'
  };

  return [
    participant.participantId,          // participantId
    participant.accessCode,             // accessCode
    participant.fullName,               // fullName
    participant.role,                   // role
    participant.organization,           // organization
    participant.partnerName,            // partnerName
    participant.partnerRole,            // partnerRole
    sessionTitles[sessionNumber] || '',  // sessionTitle
    sessionNumber,                      // sessionNumber
    d.createdAt || now,                 // createdAt
    now,                                // updatedAt
    d.relevanceScore || '',             // relevanceScore
    d.dialogueStatus || '',             // dialogueStatus
    d.mainInsight || '',                // mainInsight
    d.centralIdea || '',                // centralIdea
    d.dialogueTopic || '',              // dialogueTopic
    d.dialogueReflection || '',         // dialogueReflection
    d.organizationalConnection || '',   // organizationalConnection
    d.managementChallenge || '',        // managementChallenge
    d.actionCommitment || '',           // actionCommitment
    d.progressDefinition || '',         // progressDefinition
    d.supportNeeded || '',              // supportNeeded
    d.summarySentence || '',            // summarySentence
    d.sharingPermission || 'private',   // sharingPermission
    d.customSessionQuestionAnswer || '', // customSessionQuestionAnswer
    d.sessionDate || '',                // sessionDate
    d.isSubmitted ? 'TRUE' : 'FALSE',   // isSubmitted
    participant.participantId           // lastEditedByParticipant
  ];
}

// ============================================================
// SETUP — Run once to create sheet structure
// ============================================================

function setupSpreadsheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // --- Participants Tab ---
  let pSheet = ss.getSheetByName('Participants');
  if (!pSheet) pSheet = ss.insertSheet('Participants');
  pSheet.clearContents();
  pSheet.getRange(1, 1, 1, 8).setValues([[
    'participantId', 'accessCode', 'fullName', 'role',
    'organization', 'partnerName', 'partnerRole', 'createdAt'
  ]]);

  // Seed data
  const seeds = [
    ['P001', 'ALPHA1', 'ד"ר רחל כהן', 'מנהלת בית ספר', 'חינוך ועתיד', 'אבי לוי', 'מנהל פדגוגי', new Date().toISOString()],
    ['P002', 'BETA22', 'יוסי מזרחי', 'מנהל מחלקה', 'עיריית תל אביב', 'נועה ברק', 'מנהלת HR', new Date().toISOString()],
    ['P003', 'GAMMA3', 'מירי שפירא', 'סמנכ"לית תפעול', 'קבוצת אלוני', 'דני גל', 'יועץ אסטרטגי', new Date().toISOString()],
    ['P004', 'DELTA4', 'עמית רוזן', 'מנהל תחום', 'מכון ויצמן', 'תמר אור', 'מנהלת פרויקטים', new Date().toISOString()],
    ['P005', 'EPSI55', 'שרה ברנשטיין', 'מנהלת אזורית', 'חברת סיקו', 'רן שמיר', 'מנהל שיווק', new Date().toISOString()],
  ];
  seeds.forEach(row => pSheet.appendRow(row));

  // --- Responses Tab ---
  let rSheet = ss.getSheetByName('Responses');
  if (!rSheet) rSheet = ss.insertSheet('Responses');
  rSheet.clearContents();
  rSheet.getRange(1, 1, 1, 27).setValues([[
    'participantId', 'accessCode', 'fullName', 'role', 'organization',
    'partnerName', 'partnerRole', 'sessionTitle', 'sessionNumber',
    'createdAt', 'updatedAt', 'relevanceScore', 'dialogueStatus',
    'mainInsight', 'centralIdea', 'dialogueTopic', 'dialogueReflection',
    'organizationalConnection', 'managementChallenge', 'actionCommitment',
    'progressDefinition', 'supportNeeded', 'summarySentence',
    'customSessionQuestionAnswer', 'sessionDate', 'isSubmitted', 'lastEditedByParticipant'
  ]]);

  // --- Settings Tab ---
  let sSheet = ss.getSheetByName('Settings');
  if (!sSheet) sSheet = ss.insertSheet('Settings');
  sSheet.clearContents();
  sSheet.getRange(1, 1, 1, 2).setValues([['key', 'value']]);
  sSheet.appendRow(['programName', 'מנהל מאמץ מנהל']);
  sSheet.appendRow(['adminPassword', ADMIN_PASSWORD]);
  sSheet.appendRow(['totalSessions', '5']);
  sSheet.appendRow(['createdAt', new Date().toISOString()]);

  // --- Export Tab ---
  let eSheet = ss.getSheetByName('Export');
  if (!eSheet) eSheet = ss.insertSheet('Export');
  eSheet.clearContents();
  eSheet.getRange(1, 1).setValue('לשימוש ייצוא — ייוצר אוטומטית');

  return 'Setup complete!';
}
