// ============================================================
// מנהל מאמץ מנהל — Google Apps Script Backend
// ============================================================

const SPREADSHEET_ID = '1y3DWf3LULs7JRFSUNhg9pjfr7fTvKOaufUXBt0tyNZ0';
const ADMIN_PASSWORDS = ['yael123', 'idan123'];

// ============================================================
// MAIN ROUTER
// ============================================================

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', message: 'API is running' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    let body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch(parseErr) {
      body = e.parameter || {};
    }
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
      case 'adminGetManagementMeetings': result = handleAdminGetManagementMeetings(body); break;
      case 'adminUpsertManagementMeeting': result = handleAdminUpsertManagementMeeting(body); break;
      case 'adminDeleteManagementMeeting': result = handleAdminDeleteManagementMeeting(body); break;
      case 'getParticipantByLink': result = handleGetParticipantByLink(body); break;
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

function doOptions(e) {
  return ContentService
    .createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT);
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
  const tokenCol = ensureParticipantTokenColumn(sheet, data);
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][1].toString().toLowerCase() === accessCode.toString().toLowerCase()) {
      const participantToken = ensureParticipantTokenForRow(sheet, data, i, tokenCol);
      return {
        success: true,
        participant: {
          participantId: data[i][0],
          accessCode: data[i][1],
          fullName: data[i][2],
          role: data[i][3],
          organization: data[i][4],
          partnerName: data[i][5],
          partnerRole: data[i][6],
          partnerOrganization: data[i][7] || '',
          participantToken
        }
      };
    }
  }
  return { success: false, error: 'קוד גישה שגוי' };
}

function handleGetParticipantByLink(body) {
  const { participantToken } = body;
  if (!participantToken) return { success: false, error: 'קישור אישי חסר או לא תקין' };

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Participants');
  const data = sheet.getDataRange().getValues();
  const tokenCol = ensureParticipantTokenColumn(sheet, data);

  for (let i = 1; i < data.length; i++) {
    const rowToken = ensureParticipantTokenForRow(sheet, data, i, tokenCol);
    if (String(rowToken) === String(participantToken)) {
      return {
        success: true,
        participant: {
          participantId: data[i][0],
          accessCode: data[i][1],
          fullName: data[i][2],
          role: data[i][3],
          organization: data[i][4],
          partnerName: data[i][5],
          partnerRole: data[i][6],
          partnerOrganization: data[i][7] || '',
          participantToken: rowToken
        }
      };
    }
  }

  return { success: false, error: 'קישור אישי לא נמצא' };
}

function handleGetParticipant(body) {
  return handleLogin(body);
}

// ============================================================
// GET PARTICIPANT NAMES
// ============================================================

function handleGetParticipantNames() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Participants');
  const data = sheet.getDataRange().getValues();
  
  const names = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][2]) {
      names.push({
        accessCode: data[i][1],
        fullName: data[i][2],
        organization: data[i][4] || ''
      });
    }
  }
  names.sort((a, b) => a.fullName.localeCompare(b.fullName, 'he'));
  return { success: true, names };
}

// ============================================================
// SESSION RESPONSES
// ============================================================

function handleSaveSession(body) {
  const { accessCode, sessionNumber, data: sessionData } = body;
  if (!accessCode || !sessionNumber) return { success: false, error: 'נתונים חסרים' };

  const loginResult = handleLogin({ accessCode });
  if (!loginResult.success) return loginResult;

  const participant = loginResult.participant;
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const now = new Date().toISOString();
  const rowData = buildResponseRow(participant, sessionNumber, sessionData, now);

  const sheetName = 'Session' + sessionNumber;
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    const headers = [
      'participantId','accessCode','fullName','role','organization',
      'partnerName','partnerRole','sessionTitle','sessionNumber',
      'createdAt','updatedAt','relevanceScore','dialogueStatus',
      'mainInsight','centralIdea','dialogueTopic','dialogueReflection',
      'organizationalConnection','managementChallenge','actionCommitment',
      'progressDefinition','supportNeeded','summarySentence',
      'customSessionQuestionAnswer','sessionDate','isSubmitted','lastEditedByParticipant'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  const allData = sheet.getDataRange().getValues();

  for (let i = 1; i < allData.length; i++) {
    if (allData[i][0] === participant.participantId) {
      sheet.getRange(i + 1, 1, 1, rowData.length).setValues([rowData]);
      updateMasterSheet(ss, participant.participantId, sessionNumber, rowData);
      return { success: true, message: 'עודכן בהצלחה', updatedAt: now };
    }
  }

  sheet.appendRow(rowData);
  updateMasterSheet(ss, participant.participantId, sessionNumber, rowData);
  return { success: true, message: 'נשמר בהצלחה', createdAt: now };
}

function updateMasterSheet(ss, participantId, sessionNumber, rowData) {
  let sheet = ss.getSheetByName('Responses');
  if (!sheet) return;
  const allData = sheet.getDataRange().getValues();
  for (let i = 1; i < allData.length; i++) {
    if (allData[i][0] === participantId && String(allData[i][8]) === String(sessionNumber)) {
      sheet.getRange(i + 1, 1, 1, rowData.length).setValues([rowData]);
      return;
    }
  }
  sheet.appendRow(rowData);
}

function handleGetSession(body) {
  const { accessCode, sessionNumber } = body;
  const loginResult = handleLogin({ accessCode });
  if (!loginResult.success) return loginResult;

  const participant = loginResult.participant;
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  const sheetName = 'Session' + sessionNumber;
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.getSheetByName('Responses');
  if (!sheet) return { success: true, data: null };

  const allData = sheet.getDataRange().getValues();
  const headers = allData[0];

  for (let i = 1; i < allData.length; i++) {
    if (allData[i][0] === participant.participantId && String(allData[i][8]) === String(sessionNumber)) {
      const row = {};
      headers.forEach((h, idx) => { row[h] = allData[i][idx]; });
      return { success: true, data: row };
    }
  }
  return { success: true, data: null };
}

function handleGetAllSessions(body) {
  const { accessCode } = body;
  const loginResult = handleLogin({ accessCode });
  if (!loginResult.success) return loginResult;

  const participant = loginResult.participant;
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  const sessions = {};
  for (let s = 1; s <= 5; s++) {
    const sheetName = 'Session' + s;
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) continue;
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0];
    for (let i = 1; i < allData.length; i++) {
      if (allData[i][0] === participant.participantId) {
        const row = {};
        headers.forEach((h, idx) => { row[h] = allData[i][idx]; });
        sessions[s] = row;
      }
    }
  }
  return { success: true, sessions };
}

// ============================================================
// ADMIN
// ============================================================

function handleAdminLogin(body) {
  if (ADMIN_PASSWORDS.includes(body.password)) {
    const adminName = body.password === 'yael123' ? 'יעל אביב' : 'עידן נחום';
    return { success: true, token: 'admin_valid', adminName };
  }
  return { success: false, error: 'סיסמה שגויה' };
}

function handleAdminGetAll(body) {
  if (!validateAdmin(body)) return { success: false, error: 'Unauthorized' };

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const pSheet = ss.getSheetByName('Participants');
  const participants = sheetToObjects(pSheet);

  const allResponses = [];
  const masterSheet = ss.getSheetByName('Responses');
  if (masterSheet) sheetToObjects(masterSheet).forEach(r => allResponses.push(r));
  for (let s = 1; s <= 5; s++) {
    const sSheet = ss.getSheetByName('Session' + s);
    if (sSheet) sheetToObjects(sSheet).forEach(r => allResponses.push(r));
  }

  const responseMap = {};
  allResponses.forEach(r => {
    const key = r.participantId + '_' + r.sessionNumber;
    if (!responseMap[key] || r.updatedAt > (responseMap[key].updatedAt || '')) {
      responseMap[key] = r;
    }
  });
  const responses = Object.values(responseMap);

  const completionMap = {};
  responses.forEach(r => {
    if (!completionMap[r.participantId]) {
      completionMap[r.participantId] = { 1: false, 2: false, 3: false, 4: false, 5: false };
    }
    const sessionNum = parseInt(r.sessionNumber);
    if (r.isSubmitted === 'TRUE' || r.isSubmitted === true) {
      completionMap[r.participantId][sessionNum] = true;
    } else if (r.isSubmitted === 'FALSE' || r.isSubmitted === false) {
      completionMap[r.participantId][sessionNum] = 'draft';
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

  const allResponses = [];
  const masterSheet = ss.getSheetByName('Responses');
  if (masterSheet) sheetToObjects(masterSheet).forEach(r => allResponses.push(r));
  for (let s = 1; s <= 5; s++) {
    const sSheet = ss.getSheetByName('Session' + s);
    if (sSheet) sheetToObjects(sSheet).forEach(r => allResponses.push(r));
  }

  const responseMap = {};
  allResponses.forEach(r => {
    const key = r.participantId + '_' + r.sessionNumber;
    if (!responseMap[key] || r.updatedAt > (responseMap[key].updatedAt || '')) {
      responseMap[key] = r;
    }
  });
  const responses = Object.values(responseMap);

  const { participantId, sessionNumber, searchQuery } = body;
  let filtered = responses;

  if (participantId) filtered = filtered.filter(r => r.participantId === participantId);
  if (sessionNumber) filtered = filtered.filter(r => r.sessionNumber == sessionNumber);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(r => JSON.stringify(r).toLowerCase().includes(q));
  }

  return { success: true, responses: filtered };
}

function handleAdminAddParticipant(body) {
  if (!validateAdmin(body)) return { success: false, error: 'Unauthorized' };

  const { fullName, role, organization, partnerName, partnerRole, partnerOrganization } = body;
  if (!fullName) return { success: false, error: 'שם חסר' };

  const participantId = 'P' + new Date().getTime();
  const accessCode = generateCode();
  const participantToken = generateParticipantToken();

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Participants');
  const data = sheet.getDataRange().getValues();
  const tokenCol = ensureParticipantTokenColumn(sheet, data);

  const baseRow = [participantId, accessCode, fullName, role || '', organization || '', partnerName || '', partnerRole || '', partnerOrganization || '', new Date().toISOString()];
  while (baseRow.length <= tokenCol) baseRow.push('');
  baseRow[tokenCol] = participantToken;
  sheet.appendRow(baseRow);

  return { success: true, participantId, accessCode, participantToken };
}

function handleAdminExport(body) {
  if (!validateAdmin(body)) return { success: false, error: 'Unauthorized' };

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const pSheet = ss.getSheetByName('Participants');

  const allResponses = [];
  const masterSheet = ss.getSheetByName('Responses');
  if (masterSheet) sheetToObjects(masterSheet).forEach(r => allResponses.push(r));
  for (let s = 1; s <= 5; s++) {
    const sSheet = ss.getSheetByName('Session' + s);
    if (sSheet) sheetToObjects(sSheet).forEach(r => allResponses.push(r));
  }
  const responseMap = {};
  allResponses.forEach(r => {
    const key = r.participantId + '_' + r.sessionNumber;
    if (!responseMap[key] || r.updatedAt > (responseMap[key].updatedAt || '')) responseMap[key] = r;
  });

  return {
    success: true,
    participants: sheetToObjects(pSheet),
    responses: Object.values(responseMap),
    exportedAt: new Date().toISOString()
  };
}

function handleAdminGetManagementMeetings(body) {
  if (!validateAdmin(body)) return { success: false, error: 'Unauthorized' };

  const sheet = getOrCreateManagementMeetingsSheet();
  const meetings = sheetToObjects(sheet)
    .filter(m => m.teamName && m.meetingDate)
    .sort((a, b) => String(a.meetingDate).localeCompare(String(b.meetingDate), 'he'));

  return { success: true, meetings };
}

function handleAdminUpsertManagementMeeting(body) {
  if (!validateAdmin(body)) return { success: false, error: 'Unauthorized' };

  const { id, teamName, meetingDate } = body;
  if (!teamName || !meetingDate) return { success: false, error: 'שם צוות ותאריך נדרשים' };

  const sheet = getOrCreateManagementMeetingsSheet();
  const data = sheet.getDataRange().getValues();
  const now = new Date().toISOString();

  if (id) {
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) {
        sheet.getRange(i + 1, 2, 1, 3).setValues([[teamName, meetingDate, now]]);
        return { success: true, id, updatedAt: now };
      }
    }
  }

  const newId = 'MM' + new Date().getTime();
  sheet.appendRow([newId, teamName, meetingDate, now, now]);
  return { success: true, id: newId, createdAt: now };
}

function handleAdminDeleteManagementMeeting(body) {
  if (!validateAdmin(body)) return { success: false, error: 'Unauthorized' };

  const { id } = body;
  if (!id) return { success: false, error: 'Missing id' };

  const sheet = getOrCreateManagementMeetingsSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }

  return { success: false, error: 'Meeting not found' };
}

// ============================================================
// HELPERS
// ============================================================

function validateAdmin(body) {
  return body.token === 'admin_valid';
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function generateParticipantToken() {
  return (Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '')).toLowerCase();
}

function ensureParticipantTokenColumn(sheet, data) {
  const headers = data[0] || [];
  const tokenHeaderIndex = headers.indexOf('participantToken');
  if (tokenHeaderIndex >= 0) return tokenHeaderIndex;

  const newCol = headers.length + 1;
  sheet.getRange(1, newCol).setValue('participantToken');
  return newCol - 1;
}

function ensureParticipantTokenForRow(sheet, data, rowIndex, tokenCol) {
  const currentToken = data[rowIndex][tokenCol];
  if (currentToken) return currentToken;

  const newToken = generateParticipantToken();
  sheet.getRange(rowIndex + 1, tokenCol + 1).setValue(newToken);
  data[rowIndex][tokenCol] = newToken;
  return newToken;
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
    participant.participantId,
    participant.accessCode,
    participant.fullName,
    participant.role,
    participant.organization,
    participant.partnerName,
    participant.partnerRole,
    sessionTitles[sessionNumber] || '',
    sessionNumber,
    d.createdAt || now,
    now,
    d.relevanceScore || '',
    d.dialogueStatus || '',
    d.mainInsight || '',
    d.centralIdea || '',
    d.dialogueTopic || '',
    d.dialogueReflection || '',
    d.organizationalConnection || '',
    d.managementChallenge || '',
    d.actionCommitment || '',
    d.progressDefinition || '',
    d.supportNeeded || '',
    d.summarySentence || '',
    d.customSessionQuestionAnswer || '',
    d.sessionDate || '',
    d.isSubmitted ? 'TRUE' : 'FALSE',
    participant.participantId
  ];
}

function getOrCreateManagementMeetingsSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName('ManagementMeetings');
  if (!sheet) {
    sheet = ss.insertSheet('ManagementMeetings');
    sheet.getRange(1, 1, 1, 5).setValues([[
      'id', 'teamName', 'meetingDate', 'createdAt', 'updatedAt'
    ]]);
  }
  return sheet;
}
