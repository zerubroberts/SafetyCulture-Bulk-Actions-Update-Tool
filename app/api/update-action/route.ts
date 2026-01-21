import { NextRequest, NextResponse } from "next/server";

const SAFETYCULTURE_API_BASE = "https://api.safetyculture.io";

interface UpdateActionRequest {
  apiKey: string;
  actionId: string;
  statusId: string;
  notes?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { apiKey, actionId, statusId, notes }: UpdateActionRequest = await request.json();

    if (!apiKey || !actionId || !statusId) {
      return NextResponse.json(
        { success: false, message: "Missing required fields" },
        { status: 400 }
      );
    }

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };

    // Step 1: Update the action status
    const statusResponse = await fetch(
      `${SAFETYCULTURE_API_BASE}/tasks/v1/actions/${actionId}/status`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({
          status_id: statusId,
        }),
      }
    );

    if (!statusResponse.ok) {
      const errorData = await statusResponse.json().catch(() => ({}));

      if (statusResponse.status === 404) {
        return NextResponse.json(
          { success: false, message: "Action not found" },
          { status: 200 }
        );
      }

      if (statusResponse.status === 401) {
        return NextResponse.json(
          { success: false, message: "Unauthorized - check API key" },
          { status: 200 }
        );
      }

      if (statusResponse.status === 403) {
        return NextResponse.json(
          { success: false, message: "Permission denied for this action" },
          { status: 200 }
        );
      }

      console.error("Status update error:", statusResponse.status, errorData);
      return NextResponse.json(
        { success: false, message: errorData.message || "Failed to update status" },
        { status: 200 }
      );
    }

    // Step 2: Add notes as a comment if provided
    if (notes && notes.trim()) {
      // Try using the action-specific timeline endpoint
      const commentResponse = await fetch(
        `${SAFETYCULTURE_API_BASE}/tasks/v1/actions/${actionId}/timeline/comments`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            message: [
              {
                text: {
                  text: notes.trim(),
                },
              },
            ],
          }),
        }
      );

      if (!commentResponse.ok) {
        // Status was updated successfully, but comment failed
        // We'll still consider this a partial success
        console.error("Comment add error:", await commentResponse.text());
        return NextResponse.json({
          success: true,
          message: "Status updated, but failed to add notes",
          partial: true,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: "Action updated successfully",
    });
  } catch (error) {
    console.error("Update action error:", error);
    return NextResponse.json(
      { success: false, message: "An error occurred while updating the action" },
      { status: 500 }
    );
  }
}
