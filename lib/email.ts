import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
	host: process.env.SMTP_HOST,
	port: parseInt(process.env.SMTP_PORT || "587"),
	secure: false,
	auth: {
		user: process.env.SMTP_USER,
		pass: process.env.SMTP_PASS,
	},
});

export async function sendPasswordResetEmail(
	email: string,
	displayName: string,
	resetToken: string
) {
	try {
		const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
		const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(
			email
		)}`;
		const expiryHours = 1;

		const html = `
			<!DOCTYPE html>
			<html>
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Reset Your Password - QuestZen AI</title>
				<style>
					body { 
						font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
						line-height: 1.6; 
						color: #2d3748; 
						margin: 0;
						padding: 0;
						background-color: #f7fafc;
					}
					.container { 
						max-width: 600px; 
						margin: 0 auto; 
						background: white;
						border-radius: 12px;
						overflow: hidden;
						box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
					}
					.header { 
						background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
						color: white; 
						padding: 40px 30px; 
						text-align: center; 
					}
					.header h1 { 
						margin: 0; 
						font-size: 28px;
						font-weight: 700;
					}
					.content { 
						padding: 40px 30px; 
					}
					.button { 
						display: inline-block; 
						background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
						color: white; 
						padding: 16px 32px; 
						text-decoration: none; 
						border-radius: 8px; 
						margin: 20px 0; 
						font-weight: 600;
						font-size: 16px;
						text-align: center;
						transition: transform 0.2s, box-shadow 0.2s;
					}
					.button:hover {
						transform: translateY(-2px);
						box-shadow: 0 6px 12px rgba(102, 126, 234, 0.3);
					}
					.footer { 
						text-align: center; 
						margin-top: 40px; 
						color: #718096; 
						font-size: 14px; 
						border-top: 1px solid #e2e8f0;
						padding-top: 30px;
					}
					.warning { 
						background: #fff3cd; 
						padding: 15px; 
						border-radius: 8px; 
						margin: 25px 0; 
						border-left: 4px solid #ffc107;
						color: #856404;
					}
					.code-block {
						background: #f8f9fa;
						padding: 15px;
						border-radius: 8px;
						font-family: 'Courier New', monospace;
						word-break: break-all;
						margin: 15px 0;
						border: 1px solid #e2e8f0;
					}
				</style>
			</head>
			<body>
				<div class="container">
					<div class="header">
						<h1>🔐 Password Reset</h1>
						<p>QuestZen AI - Secure Your Account</p>
					</div>
					
					<div class="content">
						<h2 style="margin-top: 0;">Hello ${displayName},</h2>
						<p>We received a request to reset your password for your QuestZen AI account.</p>
						
						<div style="text-align: center; margin: 30px 0;">
							<a href="${resetUrl}" class="button" style="color: white; text-decoration: none;background-color: #2D3748">
								🔑 Reset Your Password
							</a>
						</div>
						
					
						
						<div class="warning">
							<p style="margin: 0;">
								⚠️ <strong>This link will expire in ${expiryHours} hour${
			expiryHours > 1 ? "s" : ""
		}.</strong><br>
								If you didn't request this password reset, you can safely ignore this email.
							</p>
						</div>
						
						<p>For security reasons, please:</p>
						<ul>
							<li>Don't share this link with anyone</li>
							<li>Reset your password immediately</li>
							<li>Create a strong, unique password</li>
							<li>Contact support if you didn't request this</li>
						</ul>
					</div>
					
					<div class="footer">
						<p>QuestZen AI · Turn Goals Into Focused Quests</p>
						<p><a href="${frontendUrl}" style="color: #667eea; text-decoration: none;">Visit our website</a></p>
						<p style="font-size: 12px; color: #a0aec0; margin-top: 20px;">
							This email was sent by QuestZen AI's security system.<br>
							© ${new Date().getFullYear()} QuestZen AI. All rights reserved.
						</p>
					</div>
				</div>
			</body>
			</html>
		`;

		await transporter.sendMail({
			from:
				process.env.SMTP_FROM ||
				'"QuestZen AI Security" <security@questzen.app>',
			to: email,
			subject: "🔐 Reset Your QuestZen AI Password",
			html,
		});

		console.log(`Password reset email sent to ${email}`);
		return true;
	} catch (error) {
		console.error(`Failed to send password reset email to ${email}:`, error);
		throw error;
	}
}

// NEW: Password reset confirmation email
export async function sendPasswordResetConfirmationEmail(
	email: string,
	displayName: string
) {
	try {
		const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

		const html = `
			<!DOCTYPE html>
			<html>
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Password Reset Successful - QuestZen AI</title>
				<style>
					/* Same styles as above, simplified for brevity */
					body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
					.container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; }
					.header { background: linear-gradient(135deg, #48bb78 0%, #38a169 100%); color: white; padding: 40px 30px; text-align: center; }
					.content { padding: 40px 30px; }
					.success { background: #c6f6d5; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #38a169; }
				</style>
			</head>
			<body>
				<div class="container">
					<div class="header">
						<h1>✅ Password Reset Successful</h1>
						<p>QuestZen AI - Account Secured</p>
					</div>
					
					<div class="content">
						<h2 style="margin-top: 0;">Hello ${displayName},</h2>
						
						<div class="success">
							<p style="margin: 0; color: #22543d; font-weight: 600;">
								✓ Your password has been successfully reset.
							</p>
						</div>
						
						<p>If you made this change, you can safely ignore this email.</p>
						
						<p>If you did NOT reset your password:</p>
						<ol>
							<li>Reset your password immediately using the link above</li>
							<li>Contact our support team</li>
							<li>Review your account security settings</li>
						</ol>
						
						<div style="text-align: center; margin: 30px 0;">
							<a href="${frontendUrl}/login" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600;">
								Log In to Your Account
							</a>
						</div>
						
						<p>Need help? <a href="${frontendUrl}/support" style="color: #667eea;">Contact Support</a></p>
					</div>
				</div>
			</body>
			</html>
		`;

		await transporter.sendMail({
			from:
				process.env.SMTP_FROM ||
				'"QuestZen AI Security" <security@questzen.app>',
			to: email,
			subject: "✅ Your QuestZen AI Password Has Been Reset",
			html,
		});

		console.log(`Password reset confirmation sent to ${email}`);
		return true;
	} catch (error) {
		console.error(`Failed to send reset confirmation to ${email}:`, error);
		throw error;
	}
}

export async function sendWelcomeEmail(email: string, displayName: string) {
	try {
		const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

		const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #667eea; color: white; padding: 20px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Welcome to QuestZen AI!</h1>
          </div>
          <h2>Hello ${displayName}!</h2>
          <p>We're excited to have you on board. Start your journey to achieving your goals with AI-powered guidance.</p>
          <p><a href="${frontendUrl}">Get started by creating your first quest!</a></p>
        </div>
      </body>
      </html>
    `;

		await transporter.sendMail({
			from: process.env.SMTP_FROM || '"QuestZen AI" <welcome@questzen.app>',
			to: email,
			subject: "Welcome to QuestZen AI! 🎯",
			html: html,
			text: `Welcome to QuestZen AI, ${displayName}! We're excited to have you on board. Get started at: ${frontendUrl}`,
		});

		console.log(`Welcome email sent to ${email}`);
		return true;
	} catch (error) {
		console.error(`Failed to send welcome email to ${email}:`, error);
		throw error;
	}
}

export async function sendGoalReminderEmail(email: string, goalTitle: string) {
	try {
		await transporter.sendMail({
			from: process.env.SMTP_FROM || "noreply@questzen.app",
			to: email,
			subject: `Reminder: ${goalTitle} 📌`,
			html: `
        <h2>Don't forget about your quest!</h2>
        <p><strong>${goalTitle}</strong></p>
        <p>Keep up the momentum and complete your tasks today.</p>
      `,
		});
	} catch (error) {
		console.error("Email sending error:", error);
	}
}

// NEW: Collaboration invitation email
export async function sendCollaborationEmail(
	to: string,
	data: {
		inviterName: string;
		inviterEmail: string;
		habitTitle: string;
		habitCategory: string;
		habitDescription: string;
		invitationId: string;
		isExistingUser: boolean;
		type?: "quest" | "habit";
	}
) {
	try {
		const {
			inviterName,
			habitTitle,
			invitationId,
			isExistingUser,
			habitCategory,
			habitDescription,
		} = data;

		const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
		const acceptanceUrl = `${frontendUrl}/accept-invitation/${invitationId}`;
		const signupUrl = `${frontendUrl}/signup?accept-invitation=${invitationId}`;

		const subject = isExistingUser
			? `🎯 ${inviterName} invited you to collaborate on "${habitTitle}"`
			: `🤝 Join QuestZen AI & collaborate with ${inviterName}`;

		const habitDetails = `
      <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #667eea;">
        <h3 style="margin-top: 0; color: #2d3748;">${habitTitle}</h3>
        ${
					habitCategory
						? `<p><strong>Category:</strong> ${habitCategory}</p>`
						: ""
				}
        ${
					habitDescription
						? `<p><strong>Description:</strong> ${habitDescription}</p>`
						: ""
				}
        
      </div>
    `;

		const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6; 
            color: #2d3748; 
            margin: 0;
            padding: 0;
            background-color: #f7fafc;
          }
          .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }
          .header { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            color: white; 
            padding: 40px 30px; 
            text-align: center; 
          }
          .header h1 { 
            margin: 0; 
            font-size: 28px;
            font-weight: 700;
          }
          .header p {
            margin: 10px 0 0;
            opacity: 0.9;
            font-size: 16px;
          }
          .content { 
            padding: 40px 30px; 
          }
          .inviter-info {
            display: flex;
            align-items: center;
            gap: 15px;
            margin-bottom: 25px;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 8px;
          }
          .inviter-avatar {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 24px;
            font-weight: bold;
          }
          .button { 
            display: inline-block; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            color: white; 
            padding: 16px 32px; 
            text-decoration: none; 
            border-radius: 8px; 
            margin: 20px 0; 
            font-weight: 600;
            font-size: 16px;
            text-align: center;
            border: none;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
          }
          .button:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 12px rgba(102, 126, 234, 0.3);
          }
          .footer { 
            text-align: center; 
            margin-top: 40px; 
            color: #718096; 
            font-size: 14px; 
            border-top: 1px solid #e2e8f0;
            padding-top: 30px;
          }
          .details {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin: 25px 0;
          }
          .logo {
            font-size: 24px;
            font-weight: bold;
            color: white;
            text-decoration: none;
          }
          @media (max-width: 600px) {
            .container {
              border-radius: 0;
            }
            .content {
              padding: 20px;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎯 QuestZen AI</h1>
            <p>Turn Goals Into Focused Quests</p>
          </div>
          
          <div class="content">
            <h2 style="margin-top: 0;">You've been invited to collaborate!</h2>
            
            <div class="inviter-info">
              <div class="inviter-avatar">${inviterName
								.charAt(0)
								.toUpperCase()}</div>
              <div>
                <p style="margin: 0 0 5px 0; font-weight: 600;">${inviterName}</p>
                <p style="margin: 0; color: #718096; font-size: 14px;">has invited you to collaborate on a quest</p>
              </div>
            </div>
            
            ${habitDetails}
            
            <div class="details">
              <p><strong>How collaboration works:</strong></p>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li>View and edit the habit together</li>
                <li>Track progress in real-time</li>
                <li>Chat with collaborators</li>
                <li>Share achievements and XP</li>
              </ul>
            </div>
            
            ${
							isExistingUser
								? `
              <p>As an existing QuestZen AI user, you can accept this invitation directly:</p>
              <div style="text-align: center;">
                <a href="${acceptanceUrl}" class="button" style="color: white; text-decoration: none;background-color: #2D3748">
                  🎯 View Invitation in QuestZen
                </a>
              </div>
              <p style="text-align: center; color: #718096; font-size: 14px; margin-top: 10px;">
                Or copy this link: <br>${acceptanceUrl}
              </p>
            `
								: `
              <p>Join QuestZen AI to collaborate on this quest and manage your goals with focus and fun!</p>
              <div style="text-align: center;">
                <a href="${signupUrl}" class="button" style="color: white; text-decoration: none;">
                  🤝 Join QuestZen AI & Accept Invitation
                </a>
              </div>
              <p style="text-align: center; color: #718096; font-size: 14px; margin-top: 10px;">
                Sign up link: <br>${signupUrl}
              </p>
            `
						}
            
            <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #ffc107;">
              <p style="margin: 0; color: #856404;">
                ⏰ <strong>This invitation expires in 7 days.</strong>
                If you believe you received this email in error, please ignore it.
              </p>
            </div>
          </div>
          
          <div class="footer">
            <p>QuestZen AI · Turn Goals Into Focused Quests</p>
            <p><a href="${frontendUrl}" style="color: #667eea; text-decoration: none;">Visit our website</a></p>
            <p style="font-size: 12px; color: #a0aec0; margin-top: 20px;">
              This email was sent by QuestZen AI's collaboration system.
              <br>© ${new Date().getFullYear()} QuestZen AI. All rights reserved.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

		const text = `
      Collaboration Invitation from ${inviterName}
      
      ${inviterName} has invited you to collaborate on the habit: "${habitTitle}"

      Habit Details:
      - Title: ${habitTitle}
      ${habitCategory ? `- Category: ${habitCategory}\n` : ""}
      ${habitDescription ? `- Description: ${habitDescription}\n` : ""}
      
      
      How collaboration works:
      • View and edit the habit together
      • Track progress in real-time
      • Chat with collaborators
      • Share achievements and XP
      
      ${
				isExistingUser
					? `As an existing QuestZen AI user, you can accept this invitation:
        ${acceptanceUrl}`
					: `Join QuestZen AI to collaborate on this quest:
        ${signupUrl}`
			}
      
      ⏰ This invitation expires in 7 days.
      
      QuestZen AI · Turn Goals Into Focused Quests
      ${frontendUrl}
      
      © ${new Date().getFullYear()} QuestZen AI. All rights reserved.
    `;

		await transporter.sendMail({
			from: process.env.SMTP_FROM || '"QuestZen AI" <noreply@questzen.app>',
			to,
			subject,
			html,
			text,
		});

		console.log(`Collaboration invitation email sent to ${to}`);
		return true;
	} catch (error) {
		console.error(`Failed to send collaboration email to ${to}:`, error);
		throw error;
	}
}

// NEW: Account deletion confirmation email
export async function sendAccountDeletionEmail(
	email: string,
	displayName: string
) {
	try {
		const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
		const supportEmail = process.env.SUPPORT_EMAIL || "support@questzen.app";
		const daysToRecover = 30; // Recovery period in days

		const html = `
			<!DOCTYPE html>
			<html>
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Account Deleted - QuestZen AI</title>
				<style>
					body { 
						font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
						line-height: 1.6; 
						color: #2d3748; 
						margin: 0;
						padding: 0;
						background-color: #f7fafc;
					}
					.container { 
						max-width: 600px; 
						margin: 0 auto; 
						background: white;
						border-radius: 12px;
						overflow: hidden;
						box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
					}
					.header { 
						background: linear-gradient(135deg, #e53e3e 0%, #c53030 100%); 
						color: white; 
						padding: 40px 30px; 
						text-align: center; 
					}
					.content { 
						padding: 40px 30px; 
					}
					.alert { 
						background: #fed7d7; 
						padding: 20px; 
						border-radius: 8px; 
						margin: 25px 0; 
						border-left: 4px solid #e53e3e;
						color: #742a2a;
					}
					.info { 
						background: #e6fffa; 
						padding: 20px; 
						border-radius: 8px; 
						margin: 25px 0; 
						border-left: 4px solid #38b2ac;
						color: #234e52;
					}
					.footer { 
						text-align: center; 
						margin-top: 40px; 
						color: #718096; 
						font-size: 14px; 
						border-top: 1px solid #e2e8f0;
						padding-top: 30px;
					}
					.button { 
						display: inline-block; 
						background: #3182ce; 
						color: white; 
						padding: 12px 24px; 
						text-decoration: none; 
						border-radius: 8px; 
						margin: 10px 0; 
						font-weight: 600;
					}
				</style>
			</head>
			<body>
				<div class="container">
					<div class="header">
						<h1>👋 Account Deleted</h1>
						<p>QuestZen AI - Goodbye, ${displayName}</p>
					</div>
					
					<div class="content">
						<div class="alert">
							<p style="margin: 0; font-weight: 600;">
								⚠️ Your QuestZen AI account has been successfully deleted.
							</p>
						</div>
						
						<p>Hello ${displayName},</p>
						
						<p>This email confirms that your QuestZen AI account has been permanently deleted.</p>
						
						<div class="info">
							<p style="margin: 0 0 10px 0; font-weight: 600;">📝 What was deleted:</p>
							<ul style="margin: 0; padding-left: 20px;">
								<li>Your user profile and account information</li>
								<li>All your quests and goals</li>
								<li>Progress data and achievements</li>
								<li>Focus sessions and analytics</li>
								<li>Collaborations and invitations</li>
							</ul>
						</div>
						
						<div class="alert">
							<p style="margin: 0;">
								<strong>Recovery Period:</strong> <br>
								You have <strong>${daysToRecover} days</strong> to contact us if this was a mistake.<br>
								After this period, your data will be permanently unrecoverable.
							</p>
						</div>
						
						<p><strong>If this was a mistake:</strong></p>
						<p>
							Email us immediately at: <br>
							<a href="mailto:${supportEmail}" style="color: #3182ce;">${supportEmail}</a>
						</p>
						
						<p><strong>Need to start fresh?</strong></p>
						<p>
							You can create a new account anytime at:<br>
							<a href="${frontendUrl}/signup" style="color: #3182ce;">${frontendUrl}/signup</a>
						</p>
						
						<p>Thank you for being part of QuestZen AI. We wish you the best in your future endeavors!</p>
						
						<p style="color: #718096; font-size: 14px; margin-top: 30px;">
							<em>"Every end is a new beginning."</em>
						</p>
					</div>
					
					<div class="footer">
						<p>QuestZen AI · Turn Goals Into Focused Quests</p>
						<p><a href="${frontendUrl}" style="color: #667eea; text-decoration: none;">Visit our website</a></p>
						<p style="font-size: 12px; color: #a0aec0; margin-top: 20px;">
							This is an automated message. Please do not reply.<br>
							© ${new Date().getFullYear()} QuestZen AI. All rights reserved.
						</p>
					</div>
				</div>
			</body>
			</html>
		`;

		await transporter.sendMail({
			from:
				process.env.SMTP_FROM || '"QuestZen AI Support" <support@questzen.app>',
			to: email,
			subject: "👋 Your QuestZen AI Account Has Been Deleted",
			html,
		});

		console.log(`Account deletion email sent to ${email}`);
		return true;
	} catch (error) {
		console.error(`Failed to send account deletion email to ${email}:`, error);
		throw error;
	}
}

// NEW: Account deletion notification to admin (optional)
// ... existing code ...

// Update the admin notification to include Paystack info
export async function sendAdminDeletionNotification(
	userEmail: string,
	displayName: string,
	paystackCustomerCode?: string,
	reason?: string
) {
	try {
		const adminEmail = process.env.ADMIN_EMAIL;
		if (!adminEmail) return;

		const html = `
			<!DOCTYPE html>
			<html>
			<head>
				<meta charset="UTF-8">
				<style>
					body { font-family: Arial, sans-serif; }
					.container { max-width: 600px; margin: 0 auto; }
					.header { background: #e53e3e; color: white; padding: 20px; text-align: center; }
					.content { padding: 20px; border: 1px solid #ddd; }
					.info { background: #f7fafc; padding: 15px; margin: 15px 0; border-left: 4px solid #e53e3e; }
					.warning { background: #fff3cd; padding: 15px; margin: 15px 0; border-left: 4px solid #ffc107; }
				</style>
			</head>
			<body>
				<div class="container">
					<div class="header">
						<h2>🚨 Account Deletion Alert</h2>
					</div>
					<div class="content">
						<p>A user has deleted their account:</p>
						<div class="info">
							<p><strong>User:</strong> ${displayName} (${userEmail})</p>
							<p><strong>Deleted At:</strong> ${new Date().toLocaleString()}</p>
							${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ""}
							${
								paystackCustomerCode
									? `<p><strong>Paystack Customer Code:</strong> ${paystackCustomerCode}</p>`
									: ""
							}
						</div>
						
						<div class="warning">
							<p><strong>Action Required:</strong></p>
							<ol>
								<li>Check if user had active subscription</li>
								${
									paystackCustomerCode
										? `<li>Verify subscription cancellation in Paystack dashboard</li>`
										: ""
								}
								<li>Review archived data if needed</li>
							</ol>
						</div>
						
						<p><strong>What was deleted:</strong></p>
						<ul>
							<li>User profile and account information</li>
							<li>All quests and goals</li>
							<li>Progress data and achievements</li>
							<li>Focus sessions and analytics</li>
							<li>Collaborations and invitations</li>
						</ul>
						
						<p>This action was triggered by the user through the settings page.</p>
					</div>
				</div>
			</body>
			</html>
		`;

		await transporter.sendMail({
			from:
				process.env.SMTP_FROM || '"QuestZen AI System" <system@questzen.app>',
			to: adminEmail,
			subject: `🚨 Account Deleted: ${userEmail}`,
			html,
		});

		console.log(`Admin notification sent for deleted account: ${userEmail}`);
	} catch (error) {
		console.error("Failed to send admin notification:", error);
	}
}
