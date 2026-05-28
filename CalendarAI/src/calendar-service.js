const { google } = require('googleapis');
const { shell } = require('electron');
const http = require('http');
const url = require('url');
const fs = require('fs');

class CalendarService {
  constructor(clientId, clientSecret, tokensPath) {
    this.tokensPath = tokensPath;
    this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
    this._loadTokens();

    // Persist refreshed tokens automatically
    this.oauth2Client.on('tokens', (tokens) => {
      const merged = { ...this._readTokens(), ...tokens };
      this._saveTokens(merged);
      this.oauth2Client.setCredentials(merged);
    });
  }

  get isAuthenticated() {
    const c = this.oauth2Client.credentials;
    return !!(c && c.access_token);
  }

  _readTokens() {
    try { return JSON.parse(fs.readFileSync(this.tokensPath, 'utf8')); } catch { return null; }
  }

  _loadTokens() {
    const t = this._readTokens();
    if (t) this.oauth2Client.setCredentials(t);
  }

  _saveTokens(tokens) {
    try { fs.writeFileSync(this.tokensPath, JSON.stringify(tokens, null, 2)); } catch {}
  }

  async authenticate() {
    if (this.isAuthenticated) {
      try { await this.oauth2Client.getAccessToken(); return { success: true }; } catch {}
    }

    return new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        const parsed = url.parse(req.url, true);
        const code = parsed.query.code;
        if (!code) { res.end(''); return; }

        try {
          const redirectUri = `http://127.0.0.1:${server.address().port}`;
          this.oauth2Client.redirectUri = redirectUri;
          const { tokens } = await this.oauth2Client.getToken(code);
          this.oauth2Client.setCredentials(tokens);
          this._saveTokens(tokens);
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`<!DOCTYPE html><html><head><style>*{margin:0;padding:0}body{font-family:sans-serif;background:#0e0e10;color:#f0ede8;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:12px}</style></head><body><h2 style="color:#ff9f4a">&#10003; Connected to Google Calendar</h2><p style="opacity:.6">You can close this tab and return to CalendarAI.</p></body></html>`);
          server.close();
          resolve({ success: true });
        } catch (e) {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('Authentication failed: ' + e.message);
          server.close();
          reject(e);
        }
      });

      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        const redirectUri = `http://127.0.0.1:${port}`;
        this.oauth2Client.redirectUri = redirectUri;

        const authUrl = this.oauth2Client.generateAuthUrl({
          access_type: 'offline',
          scope: ['https://www.googleapis.com/auth/calendar.readonly'],
          prompt: 'consent',
          redirect_uri: redirectUri
        });

        shell.openExternal(authUrl);
      });

      server.on('error', reject);
    });
  }

  async getEvents(year) {
    await this.oauth2Client.getAccessToken();

    const calListRes = await this.calendar.calendarList.list();
    const calendarItems = calListRes.data.items || [];
    const calendarNameById  = Object.fromEntries(calendarItems.map(c => [c.id, c.summary]));
    const calendarColorById = Object.fromEntries(calendarItems.map(c => [c.id, c.backgroundColor || null]));

    const timeMin = new Date(year, 0, 1).toISOString();
    const timeMax = new Date(year + 1, 0, 1).toISOString();

    const perCalendar = await Promise.all(calendarItems.map(async ({ id: calendarId }) => {
      const events = [];
      let pageToken;
      do {
        try {
          const res = await this.calendar.events.list({
            calendarId,
            timeMin,
            timeMax,
            maxResults: 250,
            singleEvents: true,
            orderBy: 'startTime',
            pageToken
          });
          const items = res.data.items || [];
          items.forEach(ev => {
            ev._calendarName  = calendarNameById[calendarId]  || calendarId;
            ev._calendarColor = calendarColorById[calendarId] || null;
          });
          events.push(...items);
          pageToken = res.data.nextPageToken;
        } catch (e) {
          console.error(`Skipping calendar ${calendarId}:`, e.message);
          break;
        }
      } while (pageToken);
      return events;
    }));

    return perCalendar.flat().sort((a, b) => {
      const aDate = a.start?.dateTime || a.start?.date || '';
      const bDate = b.start?.dateTime || b.start?.date || '';
      return aDate.localeCompare(bDate);
    });
  }

  async getCalendars() {
    await this.oauth2Client.getAccessToken();
    const res = await this.calendar.calendarList.list();
    return (res.data.items || []).map(cal => ({
      id: cal.id,
      name: cal.summary,
      primary: cal.primary || false,
      color: cal.backgroundColor || null
    }));
  }

  signOut() {
    this.oauth2Client.setCredentials({});
    try { fs.unlinkSync(this.tokensPath); } catch {}
  }

  eventToText(event) {
    const start = event.start?.dateTime || event.start?.date || '';
    const end = event.end?.dateTime || event.end?.date || '';
    const parts = [`Title: ${event.summary || '(No title)'}`];
    if (event._calendarName) parts.push(`Calendar: ${event._calendarName}`);
    if (start) parts.push(`Start: ${start}`);
    if (end) parts.push(`End: ${end}`);
    if (event.location) parts.push(`Location: ${event.location}`);
    if (event.description) {
      const plain = event.description.replace(/<[^>]*>/g, '').trim().substring(0, 500);
      if (plain) parts.push(`Description: ${plain}`);
    }
    if (event.attendees?.length) {
      parts.push(`Attendees: ${event.attendees.map(a => a.displayName || a.email).join(', ')}`);
    }
    return parts.join('\n');
  }
}

module.exports = { CalendarService };
