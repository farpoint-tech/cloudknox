# Intune Dynamic Device Group AutoCreator - Separated Scripts Edition

**Version:** 1.0  
**Author:** Philipp Schmidt  
**Date:** July 15, 2025

## 📁 Project Structure

This project organizes the Intune DDG AutoCreator components into separate, modular directories for better maintainability and deployment flexibility.

```
Intune-DDG-Separate/
├── script1/                    # Primary DDG AutoCreator Script
│   └── Intune-DDG-AutoCreator-Ultimate.ps1
├── script2/                    # Secondary Script (Placeholder)
│   └── README.md
├── shared-modules/             # Shared PowerShell Modules
│   ├── AuthenticationModule.psm1
│   └── TeamsIntegrationModule.psm1
├── shared-config/              # Configuration Files
│   └── config-ultimate.json
├── docs/                       # Documentation
│   └── IntuneDynamicDeviceGroupAutoCreator-UltimateEnterpriseEdition.md
└── examples/                   # Usage Examples (Empty)
```

## 🚀 Quick Start

### Prerequisites
- PowerShell 5.1 or higher
- Microsoft Graph PowerShell SDK
- Appropriate Azure AD permissions for Intune management

### Setup Instructions

1. **Import Required Modules**
   ```powershell
   Import-Module ".\shared-modules\AuthenticationModule.psm1" -Force
   Import-Module ".\shared-modules\TeamsIntegrationModule.psm1" -Force
   ```

2. **Configure Settings**
   - Edit `shared-config\config-ultimate.json` to match your environment
   - Set appropriate group prefixes, authentication settings, and Teams webhooks

3. **Run Script1 (Primary DDG AutoCreator)**
   ```powershell
   cd script1
   .\Intune-DDG-AutoCreator-Ultimate.ps1 -ConfigPath "..\shared-config\config-ultimate.json"
   ```

## 📋 Component Overview

### Script1: Primary DDG AutoCreator
- **File:** `script1/Intune-DDG-AutoCreator-Ultimate.ps1`
- **Purpose:** Main Dynamic Device Group creation and management
- **Features:**
  - Multiple input formats (TXT, CSV, JSON)
  - Interactive GridView mode
  - Parallel processing capabilities
  - Comprehensive validation engine
  - HTML reporting with charts

### Script2: Secondary Script (Placeholder)
- **Directory:** `script2/`
- **Status:** Ready for additional script deployment
- **Purpose:** Reserved for complementary functionality or alternative implementations

### Shared Modules

#### AuthenticationModule.psm1
- Multiple authentication methods (Interactive, Device Code, Credentials)
- RBAC role validation and testing
- Secure credential handling
- Authentication profile management

#### TeamsIntegrationModule.psm1
- Microsoft Teams webhook integration
- Adaptive card notifications
- Progress updates and error alerts
- Execution summaries and dashboards

### Configuration
- **File:** `shared-config/config-ultimate.json`
- **Features:** Comprehensive configuration management
- **Environments:** Development, Testing, Production profiles
- **Customization:** Group naming templates, validation rules, performance settings

## 🔧 Module Dependencies

Both scripts can utilize the shared modules by importing them:

```powershell
# Import authentication capabilities
Import-Module ".\shared-modules\AuthenticationModule.psm1" -Force

# Import Teams integration
Import-Module ".\shared-modules\TeamsIntegrationModule.psm1" -Force
```

## 📖 Documentation

Complete documentation is available in:
- `docs/IntuneDynamicDeviceGroupAutoCreator-UltimateEnterpriseEdition.md`

## 🛠️ Customization

### Adding a Second Script
1. Place your PowerShell script in the `script2/` directory
2. Update the script to reference shared modules using relative paths:
   ```powershell
   Import-Module "..\shared-modules\AuthenticationModule.psm1" -Force
   Import-Module "..\shared-modules\TeamsIntegrationModule.psm1" -Force
   ```
3. Configure the script to use `shared-config/config-ultimate.json`

### Environment-Specific Configuration
The configuration file supports multiple environments:
- **Development:** Debug logging, interactive mode
- **Testing:** Moderate parallelism, audit mode
- **Production:** High performance, automated notifications

## 🔐 Security Considerations

- Store sensitive configuration separately from scripts
- Use appropriate authentication methods for your environment
- Regularly review and update RBAC permissions
- Enable audit logging for compliance requirements

## 📞 Support

For technical support and questions, refer to the comprehensive documentation in the `docs/` directory.

