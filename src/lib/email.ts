import nodemailer from 'nodemailer';
import type { Incident, IncidentAssignee } from '@/types';

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASSWORD,
  },
});

/**
 * Low-level email sender via Gmail SMTP. Skips silently when credentials are
 * absent (e.g. local dev without `.env.local`) so missing config doesn't crash
 * the application. Errors during send are caught and logged rather than thrown,
 * so a failed email never causes an API route to return 500.
 */
export async function sendEmail({
  to,
  subject,
  text,
  html,
}: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.warn('Gmail credentials not found. Skipping email sending.');
    return;
  }

  try {
    await transporter.sendMail({
      from: `"Telecom Heatmap" <${GMAIL_USER}>`,
      to,
      subject,
      text,
      html,
    });
  } catch (error) {
    console.error('Failed to send email:', error);
  }
}

/** Escapes special HTML characters to prevent XSS in email HTML bodies. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Formats a contact as "Display Name <email>" or just "email" if no display name. */
function contactLabel(contact: IncidentAssignee): string {
  return contact.displayName ? `${contact.displayName} <${contact.email}>` : contact.email;
}

/** Joins a list of contacts into a comma-separated string, or returns `empty` when the list is empty. */
function formatContactList(contacts: IncidentAssignee[], empty: string): string {
  if (contacts.length === 0) return empty;
  return contacts.map(contactLabel).join(', ');
}

/**
 * Builds a list of human-readable location lines for an incident email.
 * Falls back gracefully to legacy single-value fields when the multi-site
 * arrays are absent (older incidents).
 */
function formatIncidentLocation(incident: Incident): string[] {
  const sites = incident.siteIds?.length ? incident.siteIds : (incident.siteId ? [incident.siteId] : []);
  const antennas = incident.antennaIds?.length ? incident.antennaIds : (incident.antennaId ? [incident.antennaId] : []);
  const technologies = incident.technologies?.length ? incident.technologies : (incident.technology ? [incident.technology] : []);

  return [
    sites.length > 0 ? `Site${sites.length > 1 ? 's' : ''}: ${sites.join(', ')}` : 'Site: Unknown',
    antennas.length > 0 ? `Antenna${antennas.length > 1 ? 's' : ''}: ${antennas.join(', ')}` : 'Antenna: Unknown',
    technologies.length > 0 ? `Technology: ${technologies.join(', ')}` : null,
  ].filter((line): line is string => line !== null);
}

/**
 * Renders a list of label/value pairs as HTML table rows.
 * String array values are joined with `<br />` for multi-line display.
 */
function detailsHtml(rows: Array<[string, string | string[]]>): string {
  return rows.map(([label, value]) => {
    const body = Array.isArray(value)
      ? value.map(line => escapeHtml(line)).join('<br />')
      : escapeHtml(value);

    return `
      <tr>
        <td style="padding: 8px 12px; width: 140px; color: #555; font-weight: 700; vertical-align: top;">${escapeHtml(label)}</td>
        <td style="padding: 8px 12px; color: #222; vertical-align: top;">${body}</td>
      </tr>
    `;
  }).join('');
}

/**
 * Sends an email to an engineer notifying them that they have been assigned as
 * the owning engineer for a new incident. Includes urgency, location, and the
 * current field technician roster so the engineer has full context at a glance.
 */
export async function sendEngineerAssignmentNotification({
  engineerEmail,
  engineerName,
  incident,
  technicians = [],
}: {
  engineerEmail: string;
  engineerName?: string;
  incident: Incident;
  technicians?: IncidentAssignee[];
}) {
  const location = formatIncidentLocation(incident);
  const fieldTeam = formatContactList(technicians, 'No field technicians dispatched yet');
  const greeting = engineerName ? `Hello ${engineerName},` : 'Hello,';
  const subject = `[${incident.urgency}] Incident #${incident.incidentNumber} assigned to you`;
  const text = `${greeting}

You are the owning engineer for Incident #${incident.incidentNumber}.

Urgency: ${incident.urgency}
Location:
${location.map(line => `- ${line}`).join('\n')}
Field technicians: ${fieldTeam}

Please check the Telecom Heatmap dashboard for full details and acknowledge the assignment.`;

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 5px;">
      <h2 style="color: #333; margin: 0 0 12px;">Incident Assigned</h2>
      <p>${escapeHtml(greeting)}</p>
      <p>You are the owning engineer for this incident.</p>
      <table style="width: 100%; border-collapse: collapse; background-color: #f9f9f9; border-radius: 5px; margin: 20px 0;">
        ${detailsHtml([
          ['Incident', `#${incident.incidentNumber}`],
          ['Urgency', incident.urgency],
          ['Location', location],
          ['Field team', fieldTeam],
        ])}
      </table>
      <p>Please log in to the Telecom Heatmap dashboard to view the full details and acknowledge the assignment.</p>
      <hr style="border: 0; border-top: 1px solid #eaeaea; margin: 20px 0;" />
      <p style="font-size: 12px; color: #666;">This is an automated notification from the Telecom Outage Heat Map system.</p>
    </div>
  `;

  return sendEmail({
    to: engineerEmail,
    subject,
    text,
    html,
  });
}

/**
 * Sends an email to a field technician notifying them that they have been
 * dispatched to an incident. Includes the owning engineer contact and the
 * full list of co-dispatched technicians so the field team can coordinate.
 */
export async function sendTechnicianAssignmentNotification({
  technicianEmail,
  technicianName,
  incident,
  assignedEngineer,
  technicians = [],
}: {
  technicianEmail: string;
  technicianName?: string;
  incident: Incident;
  assignedEngineer?: IncidentAssignee | null;
  technicians?: IncidentAssignee[];
}) {
  const location = formatIncidentLocation(incident);
  const engineer = assignedEngineer ? contactLabel(assignedEngineer) : 'No owning engineer assigned yet';
  const fieldTeam = formatContactList(technicians, 'You are currently the only technician dispatched');
  const greeting = technicianName ? `Hello ${technicianName},` : 'Hello,';
  const subject = `[${incident.urgency}] Dispatch to Incident #${incident.incidentNumber}`;
  const text = `${greeting}

You have been dispatched to Incident #${incident.incidentNumber}.

Urgency: ${incident.urgency}
Location:
${location.map(line => `- ${line}`).join('\n')}
Owning engineer: ${engineer}
Technicians on this dispatch: ${fieldTeam}

Please coordinate with the owning engineer and check the Telecom Heatmap technician view for full details.`;

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 5px;">
      <h2 style="color: #333; margin: 0 0 12px;">Technician Dispatch</h2>
      <p>${escapeHtml(greeting)}</p>
      <p>You have been dispatched to this incident.</p>
      <table style="width: 100%; border-collapse: collapse; background-color: #f9f9f9; border-radius: 5px; margin: 20px 0;">
        ${detailsHtml([
          ['Incident', `#${incident.incidentNumber}`],
          ['Urgency', incident.urgency],
          ['Location', location],
          ['Owning engineer', engineer],
          ['Field team', fieldTeam],
        ])}
      </table>
      <p>Please coordinate with the owning engineer and check the Telecom Heatmap technician view for full details.</p>
      <hr style="border: 0; border-top: 1px solid #eaeaea; margin: 20px 0;" />
      <p style="font-size: 12px; color: #666;">This is an automated notification from the Telecom Outage Heat Map system.</p>
    </div>
  `;

  return sendEmail({
    to: technicianEmail,
    subject,
    text,
    html,
  });
}
