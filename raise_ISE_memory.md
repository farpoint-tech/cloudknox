# In ISE ausführen vor dem Script
$ExecutionContext.SessionState.InvokeCommand.CommandNotFoundAction = 'SilentlyContinue'
[System.Management.Automation.SessionState].GetField('_functionTable', 'NonPublic,Instance').SetValue($ExecutionContext.SessionState, (New-Object 'System.Collections.Generic.Dictionary[string,System.Management.Automation.FunctionInfo]'))
