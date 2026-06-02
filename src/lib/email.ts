import nodemailer from 'nodemailer';

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASSWORD,
  },
});

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

export async function sendAssignmentNotification({
  engineerEmail,
  incidentNumber,
  location,
  urgency,
}: {
  engineerEmail: string;
  incidentNumber: string;
  location: string;
  urgency: string;
}) {
  const subject = `[ASSIGNED] Incident #${incidentNumber} - Action Required`;
  const text = `Hello,\n\nYou have been assigned to Incident #${incidentNumber}.\n\nLocation: ${location}\nUrgency: ${urgency}\n\nPlease check the dashboard for more details.`;
  
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 5px;">
      <h2 style="color: #333;">New Incident Assignment</h2>
      <p>Hello,</p>
      <p>You have been assigned to a new incident.</p>
      <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Incident ID:</strong> #${incidentNumber}</p>
        <p><strong>Location:</strong> ${location}</p>
        <p><strong>Urgency:</strong> ${urgency}</p>
      </div>
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
