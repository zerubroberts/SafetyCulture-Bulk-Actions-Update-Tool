import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { apiKey } = await request.json();

    if (!apiKey) {
      return NextResponse.json(
        { valid: false, message: "API key is required" },
        { status: 400 }
      );
    }

    // Validate the API key by making a simple request to SafetyCulture API
    // Using the "List groups" endpoint as a validation check
    const response = await fetch("https://api.safetyculture.io/groups", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      return NextResponse.json({
        valid: true,
        message: "API key validated successfully",
      });
    } else if (response.status === 401) {
      return NextResponse.json(
        { valid: false, message: "Invalid API key. Please check and try again." },
        { status: 200 }
      );
    } else if (response.status === 403) {
      return NextResponse.json(
        { valid: false, message: "API key does not have sufficient permissions." },
        { status: 200 }
      );
    } else {
      const errorText = await response.text();
      console.error("SafetyCulture API error:", response.status, errorText);
      return NextResponse.json(
        { valid: false, message: "Failed to validate API key. Please try again." },
        { status: 200 }
      );
    }
  } catch (error) {
    console.error("Validation error:", error);
    return NextResponse.json(
      { valid: false, message: "An error occurred while validating the API key." },
      { status: 500 }
    );
  }
}
