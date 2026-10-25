-- The compiled application owns notifications. Activating it always opens stats.
on openDashboard()
  set appRoot to POSIX path of (path to me)
  set launcher to appRoot & "Contents/Resources/MemGuard/MemGuard.command"
  try
    do shell script "/bin/zsh " & quoted form of launcher
  on error errorMessage
    display alert "MemGuard konnte die Statistik nicht öffnen" message errorMessage as warning
  end try
end openDashboard

on run
  openDashboard()
end run

on reopen
  openDashboard()
end reopen

on open notificationFiles
  set notificationRoot to (POSIX path of (path to library folder from user domain)) & "Logs/MemGuard/notifications/memguard-notification."
  repeat with notificationFile in notificationFiles
    set payloadPath to POSIX path of notificationFile
    try
      if payloadPath does not start with notificationRoot then error "Diese Datei ist keine MemGuard-Mitteilung. Öffnen Sie MemGuard direkt, um die Statistik anzuzeigen."
      -- The monitor writes a private plist; its values never become script code.
      set noticeTitle to do shell script "/usr/bin/plutil -extract title raw -expect string -o - " & quoted form of payloadPath
      set noticeBody to do shell script "/usr/bin/plutil -extract body raw -expect string -o - " & quoted form of payloadPath
      display notification noticeBody with title noticeTitle subtitle "Für aktuelle Statistiken auf diese Mitteilung klicken." sound name "Basso"
      do shell script "/bin/rm " & quoted form of payloadPath
    on error errorMessage
      display alert "MemGuard-Mitteilung konnte nicht gelesen werden" message errorMessage as warning
    end try
  end repeat
end open
