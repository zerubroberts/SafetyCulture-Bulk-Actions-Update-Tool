const fs = require('fs');
const path = require('path');

// Load API key from .env file
require('dotenv').config();
const API_KEY = process.env.SAFETYCULTURE_API_KEY;

if (!API_KEY) {
  console.error('Error: SAFETYCULTURE_API_KEY not found in .env file');
  process.exit(1);
}

const API_BASE = 'https://api.safetyculture.io';

// Sample action data - varied titles and descriptions for testing
const sampleActions = [
  { title: 'Inspect fire extinguisher in Building A', description: 'Monthly fire safety inspection required' },
  { title: 'Replace broken safety railing on Level 2', description: 'Railing damaged during recent incident' },
  { title: 'Update emergency evacuation signs', description: 'Signs need to comply with new regulations' },
  { title: 'Service HVAC system in warehouse', description: 'Annual maintenance due' },
  { title: 'Repair leaking pipe in restroom', description: 'Water leak reported by staff' },
  { title: 'Install additional lighting in parking lot', description: 'Safety improvement request' },
  { title: 'Clean chemical storage area', description: 'Weekly cleaning schedule' },
  { title: 'Test emergency alarm system', description: 'Quarterly testing required' },
  { title: 'Replace worn floor mats at entrance', description: 'Slip hazard identified' },
  { title: 'Calibrate temperature sensors', description: 'Monthly calibration check' },
  { title: 'Update first aid kit contents', description: 'Expired items need replacement' },
  { title: 'Fix broken window in office 201', description: 'Window cracked and needs replacement' },
  { title: 'Inspect forklift brakes', description: 'Pre-operation safety check' },
  { title: 'Clear blocked emergency exit', description: 'Items stored blocking exit path' },
  { title: 'Review and update safety procedures', description: 'Annual procedure review' },
  { title: 'Test backup generator', description: 'Monthly operational test' },
  { title: 'Repair damaged safety barrier', description: 'Barrier hit by vehicle' },
  { title: 'Install eye wash station', description: 'Required for chemical handling area' },
  { title: 'Schedule safety training session', description: 'New employee onboarding' },
  { title: 'Audit PPE inventory levels', description: 'Ensure adequate stock of safety equipment' },
];

// Priority options
const priorities = [
  { id: '58941717-817f-4c7c-a6f6-5cd05e2bbfde', label: 'None' },
  { id: '16ba4717-adc9-4d48-bf7c-044cfe0d2727', label: 'Low' },
  { id: 'ce87c58a-eeb2-4fde-9dc4-c6e85f1f4055', label: 'Medium' },
  { id: '02eb40c1-4f46-40c5-be16-d32941c96ec9', label: 'High' },
];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createAction(actionData, index) {
  const priority = priorities[Math.floor(Math.random() * priorities.length)];

  const body = {
    title: actionData.title,
    description: actionData.description,
    priority_id: priority.id,
  };

  try {
    const response = await fetch(`${API_BASE}/tasks/v1/actions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error creating action ${index + 1}: ${response.status} - ${errorText}`);
      return null;
    }

    const result = await response.json();

    // The API returns action_id
    const actionId = result.action_id;

    console.log(`✓ Created action ${index + 1}/20: ${actionData.title}`);
    console.log(`  ID: ${actionId}`);

    return {
      Action_ID: actionId,
      Title: actionData.title,
      Current_Status: 'To Do',
      New_Status: Math.random() > 0.5 ? 'Complete' : 'In Progress',
      Notes: `Updated via bulk tool - ${new Date().toISOString().split('T')[0]}`,
    };
  } catch (error) {
    console.error(`Error creating action ${index + 1}:`, error.message);
    return null;
  }
}

async function main() {
  console.log('Starting to create 20 sample actions...\n');
  console.log('Rate limiting: 3 second delay between requests\n');

  const createdActions = [];

  for (let i = 0; i < sampleActions.length; i++) {
    const result = await createAction(sampleActions[i], i);
    if (result) {
      createdActions.push(result);
    }

    // Rate limiting - wait 3 seconds between requests to be safe
    if (i < sampleActions.length - 1) {
      await sleep(3000);
    }
  }

  console.log(`\n✓ Successfully created ${createdActions.length} actions\n`);

  // Create CSV file
  if (createdActions.length > 0) {
    const csvHeader = 'Action_ID,Title,Current_Status,New_Status,Notes\n';
    const csvRows = createdActions.map(action =>
      `${action.Action_ID},"${action.Title}",${action.Current_Status},${action.New_Status},"${action.Notes}"`
    ).join('\n');

    const csvContent = csvHeader + csvRows;
    const csvPath = path.join(__dirname, '..', '20_random_actions_new.csv');

    fs.writeFileSync(csvPath, csvContent);
    console.log(`✓ CSV file saved to: ${csvPath}\n`);
    console.log('CSV Preview:');
    console.log(csvContent);
  }
}

main().catch(console.error);
