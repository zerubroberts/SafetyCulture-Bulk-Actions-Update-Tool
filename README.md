# SafetyInsights Actions Update Tool

A web-based tool for bulk updating SafetyCulture action statuses from Excel files.

## Features

- **API Key Authentication**: Securely authenticate with your SafetyCulture API key
- **Excel Upload**: Upload .xlsx or .xls files containing action data
- **Field Mapping**: Map your Excel columns to required fields
- **Bulk Updates**: Update multiple action statuses in one go
- **Add Notes**: Optionally add notes/comments to actions
- **Progress Tracking**: Real-time progress display during updates
- **Results Summary**: See successful and failed updates

## Getting Started

### Prerequisites

- Node.js 18+ installed
- SafetyCulture account with API access (Premium or Enterprise plan)

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

### Production Build

```bash
npm run build
npm start
```

## Usage

1. **Enter API Key**: Get your API key from SafetyCulture (Settings → Integrations → API)
2. **Upload Excel File**: Upload an Excel file with your action data
3. **Map Fields**: Match your Excel columns to:
   - **Action ID** (required): The unique ID of each action
   - **Status** (required): New status value
   - **Notes** (optional): Comments to add to actions
4. **Process**: Click "Update Actions" to start the bulk update
5. **Review Results**: See which updates succeeded or failed

## Supported Status Values

| Status | Accepted Values |
|--------|----------------|
| To Do | "To Do", "todo", "to do" |
| In Progress | "In Progress", "in progress", "progress" |
| Complete | "Complete", "completed", "done" |
| Can't Do | "Can't Do", "cant do", "cannot do" |

## Excel File Format

Your Excel file should have columns for:
- Action ID (the unique identifier from SafetyCulture)
- Status (the new status to set)
- Notes (optional - will be added as a comment)

Example:
| Action_ID | New_Status | Notes |
|-----------|------------|-------|
| action_abc123 | Complete | Fixed on site |
| action_def456 | In Progress | Waiting for parts |

## API Reference

This tool uses the SafetyCulture Public API:
- [Update Action Status](https://developer.safetyculture.com/reference/actionsservice_updatestatus)
- [Add Timeline Comment](https://developer.safetyculture.com/reference/timelineservice_addcomment)

## Security

- API keys are only stored in memory during your session
- No data is persisted on the server
- All API calls are made server-side to protect your credentials

## License

MIT
