<#
.SYNOPSIS
    Teams Integration Module for DDG AutoCreator Ultimate Enterprise Edition

.DESCRIPTION
    This module provides comprehensive Microsoft Teams integration capabilities including
    webhooks, adaptive cards, notifications, and dashboard integration for the DDG AutoCreator.

.NOTES
    Author: Philipp Schmidt
    Version: 3.0
    Part of: DDG AutoCreator Ultimate Enterprise Edition
    PowerShell Version: 5.1+ (ISE Compatible)
#>

# Export functions
Export-ModuleMember -Function @(
    'Send-TeamsNotification',
    'Send-TeamsAdaptiveCard',
    'Send-TeamsExecutionSummary',
    'Send-TeamsErrorAlert',
    'Send-TeamsProgressUpdate',
    'Test-TeamsWebhook',
    'New-TeamsCard',
    'New-TeamsFactSet',
    'New-TeamsActionSet',
    'Format-TeamsMessage',
    'Get-TeamsCardTemplate'
)

#region Core Teams Functions

function Send-TeamsNotification {
    <#
    .SYNOPSIS
        Send basic notification to Microsoft Teams webhook
    
    .DESCRIPTION
        Sends a simple message card to Teams with customizable styling and content
    
    .PARAMETER WebhookUrl
        Microsoft Teams webhook URL
    
    .PARAMETER Title
        Notification title
    
    .PARAMETER Message
        Main message content
    
    .PARAMETER Color
        Theme color for the card (hex code without #)
    
    .PARAMETER Statistics
        Hashtable of statistics to include as facts
    
    .PARAMETER ImageUrl
        Optional image URL for the card
    
    .OUTPUTS
        Boolean indicating success/failure
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$WebhookUrl,
        
        [Parameter(Mandatory = $true)]
        [string]$Title,
        
        [Parameter(Mandatory = $true)]
        [string]$Message,
        
        [Parameter(Mandatory = $false)]
        [string]$Color = "0078D4",
        
        [Parameter(Mandatory = $false)]
        [hashtable]$Statistics = @{},
        
        [Parameter(Mandatory = $false)]
        [string]$ImageUrl = ""
    )
    
    try {
        Write-Verbose "Sending Teams notification: $Title"
        
        # Prepare basic message card
        $card = @{
            "@type" = "MessageCard"
            "@context" = "http://schema.org/extensions"
            "themeColor" = $Color
            "summary" = $Title
            "sections" = @()
        }
        
        # Main section
        $mainSection = @{
            "activityTitle" = $Title
            "activitySubtitle" = "DDG AutoCreator Ultimate Enterprise Edition"
            "text" = $Message
            "markdown" = $true
        }
        
        # Add image if provided
        if ($ImageUrl) {
            $mainSection["activityImage"] = $ImageUrl
        }
        
        $card.sections += $mainSection
        
        # Add statistics if provided
        if ($Statistics.Count -gt 0) {
            $facts = @()
            foreach ($key in $Statistics.Keys) {
                $facts += @{
                    "name" = $key
                    "value" = $Statistics[$key].ToString()
                }
            }
            
            $card.sections += @{
                "title" = "📊 Statistics"
                "facts" = $facts
            }
        }
        
        # Add timestamp
        $card.sections += @{
            "title" = "⏰ Timestamp"
            "text" = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        }
        
        # Send to Teams
        $body = $card | ConvertTo-Json -Depth 10
        $response = Invoke-RestMethod -Uri $WebhookUrl -Method Post -Body $body -ContentType "application/json" -ErrorAction Stop
        
        Write-Verbose "Teams notification sent successfully"
        return $true
    }
    catch {
        Write-Warning "Failed to send Teams notification: $($_.Exception.Message)"
        return $false
    }
}

function Send-TeamsAdaptiveCard {
    <#
    .SYNOPSIS
        Send advanced adaptive card to Microsoft Teams
    
    .DESCRIPTION
        Sends a rich adaptive card with advanced formatting, actions, and interactive elements
    
    .PARAMETER WebhookUrl
        Microsoft Teams webhook URL
    
    .PARAMETER CardData
        Hashtable containing adaptive card data structure
    
    .OUTPUTS
        Boolean indicating success/failure
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$WebhookUrl,
        
        [Parameter(Mandatory = $true)]
        [hashtable]$CardData
    )
    
    try {
        Write-Verbose "Sending Teams adaptive card"
        
        # Prepare adaptive card wrapper
        $message = @{
            "type" = "message"
            "attachments" = @(
                @{
                    "contentType" = "application/vnd.microsoft.card.adaptive"
                    "content" = $CardData
                }
            )
        }
        
        # Send to Teams
        $body = $message | ConvertTo-Json -Depth 15
        $response = Invoke-RestMethod -Uri $WebhookUrl -Method Post -Body $body -ContentType "application/json" -ErrorAction Stop
        
        Write-Verbose "Teams adaptive card sent successfully"
        return $true
    }
    catch {
        Write-Warning "Failed to send Teams adaptive card: $($_.Exception.Message)"
        return $false
    }
}

#endregion

#region Specialized Notification Functions

function Send-TeamsExecutionSummary {
    <#
    .SYNOPSIS
        Send comprehensive execution summary to Teams
    
    .DESCRIPTION
        Sends a detailed execution summary with statistics, charts, and action buttons
    
    .PARAMETER WebhookUrl
        Microsoft Teams webhook URL
    
    .PARAMETER Statistics
        Execution statistics hashtable
    
    .PARAMETER Results
        Array of execution results
    
    .PARAMETER DashboardUrl
        Optional URL to HTML dashboard
    
    .OUTPUTS
        Boolean indicating success/failure
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$WebhookUrl,
        
        [Parameter(Mandatory = $true)]
        [hashtable]$Statistics,
        
        [Parameter(Mandatory = $false)]
        [array]$Results = @(),
        
        [Parameter(Mandatory = $false)]
        [string]$DashboardUrl = ""
    )
    
    try {
        Write-Verbose "Sending Teams execution summary"
        
        # Determine overall status and color
        $overallStatus = if ($Statistics.FailedGroups -eq 0) { "✅ Success" } else { "⚠️ Completed with Issues" }
        $color = if ($Statistics.FailedGroups -eq 0) { "107C10" } else { "FF8C00" }
        
        # Create adaptive card
        $card = @{
            "`$schema" = "http://adaptivecards.io/schemas/adaptive-card.json"
            "type" = "AdaptiveCard"
            "version" = "1.3"
            "body" = @()
            "actions" = @()
        }
        
        # Header
        $card.body += @{
            "type" = "Container"
            "style" = "emphasis"
            "items" = @(
                @{
                    "type" = "TextBlock"
                    "text" = "🚀 DDG AutoCreator - Execution Summary"
                    "size" = "Large"
                    "weight" = "Bolder"
                    "color" = "Accent"
                },
                @{
                    "type" = "TextBlock"
                    "text" = $overallStatus
                    "size" = "Medium"
                    "weight" = "Bolder"
                    "color" = if ($Statistics.FailedGroups -eq 0) { "Good" } else { "Warning" }
                }
            )
        }
        
        # Statistics section
        $factSet = @{
            "type" = "FactSet"
            "facts" = @(
                @{ "title" = "⏱️ Execution Time"; "value" = $Statistics.ExecutionTime },
                @{ "title" = "📋 Total Items"; "value" = $Statistics.TotalItems.ToString() },
                @{ "title" = "✅ Created Groups"; "value" = $Statistics.CreatedGroups.ToString() },
                @{ "title" = "🔄 Updated Groups"; "value" = $Statistics.UpdatedGroups.ToString() },
                @{ "title" = "⏭️ Skipped Groups"; "value" = $Statistics.SkippedGroups.ToString() },
                @{ "title" = "❌ Failed Groups"; "value" = $Statistics.FailedGroups.ToString() },
                @{ "title" = "📈 Success Rate"; "value" = "$(if($Statistics.TotalItems -gt 0) { [math]::Round($Statistics.SuccessfulItems / $Statistics.TotalItems * 100, 1) } else { 0 })%" },
                @{ "title" = "⚡ Performance"; "value" = "$($Statistics.GroupsPerMinute) groups/min" }
            )
        }
        
        $card.body += @{
            "type" = "Container"
            "items" = @(
                @{
                    "type" = "TextBlock"
                    "text" = "📊 **Execution Statistics**"
                    "size" = "Medium"
                    "weight" = "Bolder"
                    "spacing" = "Medium"
                },
                $factSet
            )
        }
        
        # Progress bar
        $successRate = if ($Statistics.TotalItems -gt 0) { 
            [math]::Round($Statistics.SuccessfulItems / $Statistics.TotalItems * 100, 1) 
        } else { 0 }
        
        $card.body += @{
            "type" = "Container"
            "items" = @(
                @{
                    "type" = "TextBlock"
                    "text" = "📈 **Success Rate: $successRate%**"
                    "size" = "Medium"
                    "weight" = "Bolder"
                    "spacing" = "Medium"
                },
                @{
                    "type" = "ProgressBar"
                    "title" = "Overall Success"
                    "value" = $successRate / 100
                }
            )
        }
        
        # Error details if any
        if ($Statistics.FailedGroups -gt 0 -and $Results.Count -gt 0) {
            $failedResults = $Results | Where-Object { $_.Status -eq "Failed" } | Select-Object -First 5
            $errorText = "**Recent Errors:**`n"
            foreach ($failed in $failedResults) {
                $errorText += "• $($failed.OU): $($failed.Error)`n"
            }
            
            if ($Statistics.FailedGroups -gt 5) {
                $errorText += "• ... and $($Statistics.FailedGroups - 5) more errors"
            }
            
            $card.body += @{
                "type" = "Container"
                "style" = "attention"
                "items" = @(
                    @{
                        "type" = "TextBlock"
                        "text" = $errorText
                        "wrap" = $true
                        "size" = "Small"
                    }
                )
            }
        }
        
        # Actions
        if ($DashboardUrl) {
            $card.actions += @{
                "type" = "Action.OpenUrl"
                "title" = "📊 View Dashboard"
                "url" = $DashboardUrl
            }
        }
        
        # Add timestamp
        $card.body += @{
            "type" = "Container"
            "items" = @(
                @{
                    "type" = "TextBlock"
                    "text" = "Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
                    "size" = "Small"
                    "color" = "Accent"
                    "horizontalAlignment" = "Right"
                    "spacing" = "Medium"
                }
            )
        }
        
        # Send adaptive card
        return Send-TeamsAdaptiveCard -WebhookUrl $WebhookUrl -CardData $card
    }
    catch {
        Write-Warning "Failed to send Teams execution summary: $($_.Exception.Message)"
        return $false
    }
}

function Send-TeamsErrorAlert {
    <#
    .SYNOPSIS
        Send error alert to Teams with detailed information
    
    .DESCRIPTION
        Sends a high-priority error alert with error details and suggested actions
    
    .PARAMETER WebhookUrl
        Microsoft Teams webhook URL
    
    .PARAMETER ErrorMessage
        Main error message
    
    .PARAMETER ErrorDetails
        Additional error details
    
    .PARAMETER StackTrace
        Optional stack trace information
    
    .PARAMETER SuggestedActions
        Array of suggested remediation actions
    
    .OUTPUTS
        Boolean indicating success/failure
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$WebhookUrl,
        
        [Parameter(Mandatory = $true)]
        [string]$ErrorMessage,
        
        [Parameter(Mandatory = $false)]
        [string]$ErrorDetails = "",
        
        [Parameter(Mandatory = $false)]
        [string]$StackTrace = "",
        
        [Parameter(Mandatory = $false)]
        [array]$SuggestedActions = @()
    )
    
    try {
        Write-Verbose "Sending Teams error alert"
        
        # Create error card
        $card = @{
            "`$schema" = "http://adaptivecards.io/schemas/adaptive-card.json"
            "type" = "AdaptiveCard"
            "version" = "1.3"
            "body" = @()
        }
        
        # Header
        $card.body += @{
            "type" = "Container"
            "style" = "attention"
            "items" = @(
                @{
                    "type" = "TextBlock"
                    "text" = "🚨 DDG AutoCreator - Critical Error"
                    "size" = "Large"
                    "weight" = "Bolder"
                    "color" = "Attention"
                },
                @{
                    "type" = "TextBlock"
                    "text" = $ErrorMessage
                    "size" = "Medium"
                    "weight" = "Bolder"
                    "wrap" = $true
                }
            )
        }
        
        # Error details
        if ($ErrorDetails) {
            $card.body += @{
                "type" = "Container"
                "items" = @(
                    @{
                        "type" = "TextBlock"
                        "text" = "**Error Details:**"
                        "size" = "Medium"
                        "weight" = "Bolder"
                        "spacing" = "Medium"
                    },
                    @{
                        "type" = "TextBlock"
                        "text" = $ErrorDetails
                        "wrap" = $true
                        "fontType" = "Monospace"
                        "size" = "Small"
                    }
                )
            }
        }
        
        # Stack trace (collapsible)
        if ($StackTrace) {
            $card.body += @{
                "type" = "Container"
                "items" = @(
                    @{
                        "type" = "TextBlock"
                        "text" = "**Stack Trace:**"
                        "size" = "Medium"
                        "weight" = "Bolder"
                        "spacing" = "Medium"
                    },
                    @{
                        "type" = "TextBlock"
                        "text" = $StackTrace
                        "wrap" = $true
                        "fontType" = "Monospace"
                        "size" = "Small"
                        "maxLines" = 10
                    }
                )
            }
        }
        
        # Suggested actions
        if ($SuggestedActions.Count -gt 0) {
            $actionText = "**Suggested Actions:**`n"
            for ($i = 0; $i -lt $SuggestedActions.Count; $i++) {
                $actionText += "$($i + 1). $($SuggestedActions[$i])`n"
            }
            
            $card.body += @{
                "type" = "Container"
                "style" = "emphasis"
                "items" = @(
                    @{
                        "type" = "TextBlock"
                        "text" = $actionText
                        "wrap" = $true
                        "size" = "Small"
                    }
                )
            }
        }
        
        # Timestamp
        $card.body += @{
            "type" = "Container"
            "items" = @(
                @{
                    "type" = "TextBlock"
                    "text" = "Error occurred: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
                    "size" = "Small"
                    "color" = "Accent"
                    "horizontalAlignment" = "Right"
                    "spacing" = "Medium"
                }
            )
        }
        
        # Send adaptive card
        return Send-TeamsAdaptiveCard -WebhookUrl $WebhookUrl -CardData $card
    }
    catch {
        Write-Warning "Failed to send Teams error alert: $($_.Exception.Message)"
        return $false
    }
}

function Send-TeamsProgressUpdate {
    <#
    .SYNOPSIS
        Send progress update to Teams during long-running operations
    
    .DESCRIPTION
        Sends periodic progress updates with current status and ETA
    
    .PARAMETER WebhookUrl
        Microsoft Teams webhook URL
    
    .PARAMETER CurrentItem
        Current item being processed
    
    .PARAMETER TotalItems
        Total number of items to process
    
    .PARAMETER ProcessedItems
        Number of items already processed
    
    .PARAMETER EstimatedTimeRemaining
        Estimated time remaining
    
    .PARAMETER CurrentOperation
        Description of current operation
    
    .OUTPUTS
        Boolean indicating success/failure
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$WebhookUrl,
        
        [Parameter(Mandatory = $true)]
        [string]$CurrentItem,
        
        [Parameter(Mandatory = $true)]
        [int]$TotalItems,
        
        [Parameter(Mandatory = $true)]
        [int]$ProcessedItems,
        
        [Parameter(Mandatory = $false)]
        [string]$EstimatedTimeRemaining = "Unknown",
        
        [Parameter(Mandatory = $false)]
        [string]$CurrentOperation = "Processing"
    )
    
    try {
        Write-Verbose "Sending Teams progress update"
        
        $percentComplete = if ($TotalItems -gt 0) { 
            [math]::Round(($ProcessedItems / $TotalItems) * 100, 1) 
        } else { 0 }
        
        # Create simple message card for progress
        $card = @{
            "@type" = "MessageCard"
            "@context" = "http://schema.org/extensions"
            "themeColor" = "0078D4"
            "summary" = "DDG AutoCreator Progress Update"
            "sections" = @(
                @{
                    "activityTitle" = "🔄 DDG AutoCreator - Progress Update"
                    "activitySubtitle" = "$CurrentOperation - $percentComplete% Complete"
                    "text" = "**Current Item:** $CurrentItem`n**Progress:** $ProcessedItems / $TotalItems`n**ETA:** $EstimatedTimeRemaining"
                    "markdown" = $true
                },
                @{
                    "title" = "📊 Progress Details"
                    "facts" = @(
                        @{ "name" = "Completed"; "value" = "$ProcessedItems / $TotalItems" },
                        @{ "name" = "Percentage"; "value" = "$percentComplete%" },
                        @{ "name" = "Current Item"; "value" = $CurrentItem },
                        @{ "name" = "ETA"; "value" = $EstimatedTimeRemaining }
                    )
                }
            )
        }
        
        # Send to Teams
        $body = $card | ConvertTo-Json -Depth 10
        $response = Invoke-RestMethod -Uri $WebhookUrl -Method Post -Body $body -ContentType "application/json" -ErrorAction Stop
        
        Write-Verbose "Teams progress update sent successfully"
        return $true
    }
    catch {
        Write-Warning "Failed to send Teams progress update: $($_.Exception.Message)"
        return $false
    }
}

#endregion

#region Utility Functions

function Test-TeamsWebhook {
    <#
    .SYNOPSIS
        Test Teams webhook connectivity and validity
    
    .DESCRIPTION
        Sends a test message to verify webhook is working correctly
    
    .PARAMETER WebhookUrl
        Microsoft Teams webhook URL to test
    
    .OUTPUTS
        Boolean indicating webhook validity
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$WebhookUrl
    )
    
    try {
        Write-Verbose "Testing Teams webhook connectivity"
        
        # Validate URL format
        if (-not ($WebhookUrl -match '^https://.*\.webhook\.office\.com/.*')) {
            Write-Warning "Invalid Teams webhook URL format"
            return $false
        }
        
        # Send test message
        $testCard = @{
            "@type" = "MessageCard"
            "@context" = "http://schema.org/extensions"
            "themeColor" = "0078D4"
            "summary" = "DDG AutoCreator Webhook Test"
            "sections" = @(
                @{
                    "activityTitle" = "🧪 DDG AutoCreator - Webhook Test"
                    "activitySubtitle" = "Testing Teams integration"
                    "text" = "This is a test message to verify Teams webhook connectivity."
                    "markdown" = $true
                },
                @{
                    "title" = "Test Details"
                    "facts" = @(
                        @{ "name" = "Test Time"; "value" = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss") },
                        @{ "name" = "Module Version"; "value" = "3.0" },
                        @{ "name" = "PowerShell Version"; "value" = $PSVersionTable.PSVersion.ToString() }
                    )
                }
            )
        }
        
        $body = $testCard | ConvertTo-Json -Depth 10
        $response = Invoke-RestMethod -Uri $WebhookUrl -Method Post -Body $body -ContentType "application/json" -ErrorAction Stop
        
        Write-Verbose "Teams webhook test successful"
        return $true
    }
    catch {
        Write-Warning "Teams webhook test failed: $($_.Exception.Message)"
        return $false
    }
}

function New-TeamsCard {
    <#
    .SYNOPSIS
        Create a new Teams message card structure
    
    .DESCRIPTION
        Helper function to create properly formatted Teams message cards
    
    .PARAMETER Title
        Card title
    
    .PARAMETER Subtitle
        Card subtitle
    
    .PARAMETER Text
        Main card text
    
    .PARAMETER Color
        Theme color (hex without #)
    
    .PARAMETER Facts
        Array of fact objects with name/value pairs
    
    .OUTPUTS
        Hashtable representing Teams message card
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Title,
        
        [Parameter(Mandatory = $false)]
        [string]$Subtitle = "",
        
        [Parameter(Mandatory = $false)]
        [string]$Text = "",
        
        [Parameter(Mandatory = $false)]
        [string]$Color = "0078D4",
        
        [Parameter(Mandatory = $false)]
        [array]$Facts = @()
    )
    
    $card = @{
        "@type" = "MessageCard"
        "@context" = "http://schema.org/extensions"
        "themeColor" = $Color
        "summary" = $Title
        "sections" = @()
    }
    
    # Main section
    $mainSection = @{
        "activityTitle" = $Title
        "markdown" = $true
    }
    
    if ($Subtitle) {
        $mainSection["activitySubtitle"] = $Subtitle
    }
    
    if ($Text) {
        $mainSection["text"] = $Text
    }
    
    $card.sections += $mainSection
    
    # Facts section
    if ($Facts.Count -gt 0) {
        $card.sections += @{
            "title" = "Details"
            "facts" = $Facts
        }
    }
    
    return $card
}

function New-TeamsFactSet {
    <#
    .SYNOPSIS
        Create a fact set for Teams cards
    
    .DESCRIPTION
        Helper function to create fact sets from hashtables or objects
    
    .PARAMETER Data
        Hashtable or object to convert to facts
    
    .OUTPUTS
        Array of fact objects
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        $Data
    )
    
    $facts = @()
    
    if ($Data -is [hashtable]) {
        foreach ($key in $Data.Keys) {
            $facts += @{
                "name" = $key
                "value" = $Data[$key].ToString()
            }
        }
    }
    elseif ($Data -is [PSCustomObject]) {
        foreach ($property in $Data.PSObject.Properties) {
            $facts += @{
                "name" = $property.Name
                "value" = $property.Value.ToString()
            }
        }
    }
    
    return $facts
}

function Format-TeamsMessage {
    <#
    .SYNOPSIS
        Format text for Teams markdown
    
    .DESCRIPTION
        Helper function to format text with Teams-compatible markdown
    
    .PARAMETER Text
        Text to format
    
    .PARAMETER Bold
        Make text bold
    
    .PARAMETER Italic
        Make text italic
    
    .PARAMETER Code
        Format as code
    
    .PARAMETER Link
        URL to make text a link
    
    .OUTPUTS
        Formatted string
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Text,
        
        [Parameter(Mandatory = $false)]
        [switch]$Bold,
        
        [Parameter(Mandatory = $false)]
        [switch]$Italic,
        
        [Parameter(Mandatory = $false)]
        [switch]$Code,
        
        [Parameter(Mandatory = $false)]
        [string]$Link = ""
    )
    
    $formattedText = $Text
    
    if ($Code) {
        $formattedText = "`$formattedText`"
    }
    
    if ($Bold) {
        $formattedText = "**$formattedText**"
    }
    
    if ($Italic) {
        $formattedText = "*$formattedText*"
    }
    
    if ($Link) {
        $formattedText = "[$formattedText]($Link)"
    }
    
    return $formattedText
}

function Get-TeamsCardTemplate {
    <#
    .SYNOPSIS
        Get predefined Teams card templates
    
    .DESCRIPTION
        Returns predefined card templates for common scenarios
    
    .PARAMETER TemplateName
        Name of the template to retrieve
    
    .OUTPUTS
        Hashtable representing the card template
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("Success", "Warning", "Error", "Info", "Progress")]
        [string]$TemplateName
    )
    
    $templates = @{
        "Success" = @{
            "Color" = "107C10"
            "Icon" = "✅"
            "Title" = "Operation Completed Successfully"
        }
        "Warning" = @{
            "Color" = "FF8C00"
            "Icon" = "⚠️"
            "Title" = "Operation Completed with Warnings"
        }
        "Error" = @{
            "Color" = "D13438"
            "Icon" = "❌"
            "Title" = "Operation Failed"
        }
        "Info" = @{
            "Color" = "0078D4"
            "Icon" = "ℹ️"
            "Title" = "Information"
        }
        "Progress" = @{
            "Color" = "00BCF2"
            "Icon" = "🔄"
            "Title" = "Operation in Progress"
        }
    }
    
    return $templates[$TemplateName]
}

#endregion

#region Advanced Features

function Send-TeamsRichSummary {
    <#
    .SYNOPSIS
        Send rich summary with charts and interactive elements
    
    .DESCRIPTION
        Sends an advanced summary with embedded charts and action buttons
    
    .PARAMETER WebhookUrl
        Microsoft Teams webhook URL
    
    .PARAMETER Statistics
        Execution statistics
    
    .PARAMETER ChartData
        Chart data for visualization
    
    .PARAMETER ActionButtons
        Array of action button definitions
    
    .OUTPUTS
        Boolean indicating success/failure
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$WebhookUrl,
        
        [Parameter(Mandatory = $true)]
        [hashtable]$Statistics,
        
        [Parameter(Mandatory = $false)]
        [hashtable]$ChartData = @{},
        
        [Parameter(Mandatory = $false)]
        [array]$ActionButtons = @()
    )
    
    try {
        Write-Verbose "Sending Teams rich summary"
        
        # Create advanced adaptive card
        $card = @{
            "`$schema" = "http://adaptivecards.io/schemas/adaptive-card.json"
            "type" = "AdaptiveCard"
            "version" = "1.4"
            "body" = @()
            "actions" = @()
        }
        
        # Rich header with hero image
        $card.body += @{
            "type" = "Container"
            "style" = "emphasis"
            "items" = @(
                @{
                    "type" = "ColumnSet"
                    "columns" = @(
                        @{
                            "type" = "Column"
                            "width" = "auto"
                            "items" = @(
                                @{
                                    "type" = "Image"
                                    "url" = "https://img.icons8.com/color/96/000000/microsoft-teams.png"
                                    "size" = "Medium"
                                }
                            )
                        },
                        @{
                            "type" = "Column"
                            "width" = "stretch"
                            "items" = @(
                                @{
                                    "type" = "TextBlock"
                                    "text" = "🚀 DDG AutoCreator Ultimate"
                                    "size" = "Large"
                                    "weight" = "Bolder"
                                    "color" = "Accent"
                                },
                                @{
                                    "type" = "TextBlock"
                                    "text" = "Execution Summary Report"
                                    "size" = "Medium"
                                    "color" = "Good"
                                }
                            )
                        }
                    )
                }
            )
        }
        
        # Statistics with visual indicators
        $successRate = if ($Statistics.TotalItems -gt 0) { 
            [math]::Round($Statistics.SuccessfulItems / $Statistics.TotalItems * 100, 1) 
        } else { 0 }
        
        $card.body += @{
            "type" = "Container"
            "items" = @(
                @{
                    "type" = "TextBlock"
                    "text" = "📊 **Performance Metrics**"
                    "size" = "Medium"
                    "weight" = "Bolder"
                    "spacing" = "Medium"
                },
                @{
                    "type" = "ColumnSet"
                    "columns" = @(
                        @{
                            "type" = "Column"
                            "width" = "stretch"
                            "items" = @(
                                @{
                                    "type" = "TextBlock"
                                    "text" = "**$($Statistics.CreatedGroups)**"
                                    "size" = "ExtraLarge"
                                    "weight" = "Bolder"
                                    "color" = "Good"
                                    "horizontalAlignment" = "Center"
                                },
                                @{
                                    "type" = "TextBlock"
                                    "text" = "Created"
                                    "size" = "Small"
                                    "horizontalAlignment" = "Center"
                                }
                            )
                        },
                        @{
                            "type" = "Column"
                            "width" = "stretch"
                            "items" = @(
                                @{
                                    "type" = "TextBlock"
                                    "text" = "**$($Statistics.UpdatedGroups)**"
                                    "size" = "ExtraLarge"
                                    "weight" = "Bolder"
                                    "color" = "Accent"
                                    "horizontalAlignment" = "Center"
                                },
                                @{
                                    "type" = "TextBlock"
                                    "text" = "Updated"
                                    "size" = "Small"
                                    "horizontalAlignment" = "Center"
                                }
                            )
                        },
                        @{
                            "type" = "Column"
                            "width" = "stretch"
                            "items" = @(
                                @{
                                    "type" = "TextBlock"
                                    "text" = "**$($Statistics.FailedGroups)**"
                                    "size" = "ExtraLarge"
                                    "weight" = "Bolder"
                                    "color" = if ($Statistics.FailedGroups -eq 0) { "Good" } else { "Attention" }
                                    "horizontalAlignment" = "Center"
                                },
                                @{
                                    "type" = "TextBlock"
                                    "text" = "Failed"
                                    "size" = "Small"
                                    "horizontalAlignment" = "Center"
                                }
                            )
                        }
                    )
                }
            )
        }
        
        # Progress visualization
        $card.body += @{
            "type" = "Container"
            "items" = @(
                @{
                    "type" = "TextBlock"
                    "text" = "📈 **Overall Success Rate: $successRate%**"
                    "size" = "Medium"
                    "weight" = "Bolder"
                    "spacing" = "Medium"
                },
                @{
                    "type" = "ProgressBar"
                    "title" = "Success Rate"
                    "value" = $successRate / 100
                }
            )
        }
        
        # Add action buttons
        foreach ($button in $ActionButtons) {
            $card.actions += @{
                "type" = "Action.OpenUrl"
                "title" = $button.Title
                "url" = $button.Url
            }
        }
        
        # Send adaptive card
        return Send-TeamsAdaptiveCard -WebhookUrl $WebhookUrl -CardData $card
    }
    catch {
        Write-Warning "Failed to send Teams rich summary: $($_.Exception.Message)"
        return $false
    }
}

#endregion

