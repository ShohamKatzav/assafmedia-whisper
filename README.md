# assafmedia-whisper

## OTP PHP Service

This project requires a `settings.json` file containing configuration for the database and email service.  

Create a file at `.vscode/settings.json` with the following structure:

```json
{
  "db_host": "localhost",
  "db_name": "waclonedem_db28072025135752",
  "db_user": "root",
  "api_key": "your-brevo-api-key",
  "from_email": "your-email@example.com",
  "from_name": "Company"
}

* db_host, db_name, db_user – your database connection details.
* api_key – API key for Brevo (email sending).
* from_email, from_name – sender details for OTP emails.
The service will fail if settings.json is missing or invalid.

