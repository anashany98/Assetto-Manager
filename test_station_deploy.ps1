# Test script for station deployment
.\Deploy-ACManager.ps1 -Mode Station `
    -ServerUrl "http://localhost:8000" `
    -AgentToken "test-token-123" `
    -UpdateSigningKey "29ce2228c4ad2a41f28e9acd0343b7511673f284d4883163a37bdec3e1d6481c" `
    -StationName "SIM 1" `
    -ACPath "D:\Fake\Assetto\Corsa\Path" `
    -HasKiosk `
    -NoStart