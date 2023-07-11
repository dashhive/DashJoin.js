# Overview
How Dash Core (C++ codebase) creates denominated inputs.

# Branch
master

# Entry point
`bool CCoinJoinClientSession::CreateDenominated(CAmount nBalanceToDenominate)`
- src/coinjoin/client.cpp:1559

# Coin selection
`std::vector<CompactTallyItem> vecTally = mixingWallet.SelectCoinsGroupedByAddresses(
true,   // fSkipDenominated
true,   // fAnonymizable
true,   // fSkipUnconfirmed
400     // nMaxOupointsPerAddress
);`
# Look at
- CTransactionBuilderOutput (coinjoin/util.cpp)

