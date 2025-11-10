# Intune Policy Management Tool - Enhanced User Guide

## Overview
The Intune Policy Management Tool (Enhanced Version) is a PowerShell script designed to manage Microsoft Intune policies with a focus on reliable authentication and bulk deletion capabilities. This enhanced version includes multiple fallback methods to ensure it works in environments where previous versions failed.

## Key Features
- **Reliable Authentication**: Multiple authentication methods with fallback options
- **Enhanced Permission Handling**: Explicit scope requests and permission verification
- **Robust Policy Retrieval**: Multiple methods to retrieve policies, including direct REST API calls
- **Bulk Deletion**: Delete multiple policies at once with customizable batch sizes
- **Device Type Filtering**: Filter policies by device type (Windows, macOS, iOS, Android)
- **Policy Preview**: View policies before deletion
- **Colorful Interface**: Easy-to-read, visually appealing console output

## Prerequisites
- PowerShell 5.1 or higher
- Administrator privileges
- Internet connection
- Microsoft Intune administrator access
- Microsoft Graph PowerShell modules (automatically installed if needed)

## Installation
1. Download the `IntuneFinalTool_Enhanced.ps1` script to your computer
2. Open PowerShell with administrator privileges
3. Navigate to the directory containing the script
4. Run the script: `.\IntuneFinalTool_Enhanced.ps1`

## Authentication Methods

### Interactive Browser Authentication
This method opens a browser window where you can sign in with your credentials. This is the most straightforward method and works well in most environments.

### Device Code Authentication
This method provides a code that you enter in a browser to authenticate. This is useful in environments where browser popups are blocked or when using remote sessions.

## Required Permissions
The script requires the following Microsoft Graph permissions:
- DeviceManagementConfiguration.ReadWrite.All
- DeviceManagementApps.ReadWrite.All
- DeviceManagementServiceConfig.ReadWrite.All
- DeviceManagementManagedDevices.ReadWrite.All
- Directory.Read.All
- Directory.ReadWrite.All

The script will verify if these permissions are granted and warn you if any are missing.

## Using the Tool

### Main Menu
The tool provides a menu-driven interface with the following options:
1. Manage Device Configuration Policies
2. Manage Device Compliance Policies
3. Change Batch Size
4. Change Device Type Filter
5. Re-authenticate
6. Exit

### Batch Size Options
- Process individually (1 policy per batch)
- Small batches (10 policies)
- Medium batches (20 policies)
- Large batches (50 policies)
- Process ALL policies at once (Use with caution!)

### Device Type Filters
- All Device Types
- Windows Only
- macOS Only
- iOS Only
- Android Only

### Policy Management
When managing policies, you'll see a list of policies matching your filter criteria. You can:
- Delete ALL policies in the current batch
- Select specific policies to delete
- Navigate to the next batch
- Return to the main menu

## Troubleshooting

### Authentication Issues
If you encounter authentication errors:
1. Try the Device Code authentication method
2. Ensure you have the correct permissions in Microsoft Intune
3. Check that your account has MFA properly configured
4. Use the Re-authenticate option in the main menu if your session expires

### Policy Retrieval Issues
If you encounter errors retrieving policies:
1. The script will automatically try alternative methods to retrieve policies
2. Check the console for specific error messages
3. Verify that you have sufficient permissions to view the policies
4. Try re-authenticating with the Device Code method

### Deletion Errors
If policy deletion fails:
1. The script will automatically try alternative methods to delete policies
2. Verify that you have sufficient permissions to delete policies
3. Check if the policies are assigned to users or devices (may need to remove assignments first)
4. Try re-authenticating and attempt deletion again

## Security Considerations
- No credentials are saved to disk
- The script automatically disconnects from Microsoft Graph when exiting
- Authentication tokens are managed by the Microsoft Graph PowerShell SDK

## Technical Details
This enhanced version includes several improvements over previous versions:
- Expanded permission scopes for comprehensive access
- Permission verification to identify potential issues
- Multiple fallback methods for policy retrieval and deletion
- Direct REST API calls when standard cmdlets fail
- Improved error handling and reporting

## Support
If you encounter any issues with this tool, please contact your IT administrator or Microsoft support.
