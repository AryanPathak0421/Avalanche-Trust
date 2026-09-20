// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AvalancheTrustEscrow} from "../src/AvalancheTrustEscrow.sol";

/// @notice Deploys AvalancheTrustEscrow to the chain selected via --rpc-url.
///
/// Required env:
///   DEPLOYER_PRIVATE_KEY   hex private key of the deployer (never commit this)
/// Optional env:
///   ADMIN_ADDRESS          defaults to the deployer
///   ARBITRATOR_ADDRESS     defaults to the deployer (set this explicitly for production!)
///
/// Usage:
///   forge script script/Deploy.s.sol:Deploy --rpc-url fuji --broadcast --verify
contract Deploy is Script {
    function run() external returns (AvalancheTrustEscrow escrow) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address admin = vm.envOr("ADMIN_ADDRESS", deployer);
        address arbitrator = vm.envOr("ARBITRATOR_ADDRESS", deployer);

        string memory network = _networkName(block.chainid);

        console.log("==============================================");
        console.log("AvalancheTrust deployment");
        console.log("Network:      ", network);
        console.log("Chain ID:     ", block.chainid);
        console.log("Deployer:     ", deployer);
        console.log("Admin:        ", admin);
        console.log("Arbitrator:   ", arbitrator);
        if (arbitrator == deployer) {
            console.log("WARNING: arbitrator == deployer. Set ARBITRATOR_ADDRESS for production.");
        }

        vm.startBroadcast(deployerKey);
        escrow = new AvalancheTrustEscrow(admin, arbitrator);
        vm.stopBroadcast();

        console.log("Contract:     ", address(escrow));
        console.log("Tx hash is printed by forge in broadcast/Deploy.s.sol/<chainId>/run-latest.json");
        console.log("==============================================");

        _writeDeployment(network, address(escrow), deployer, admin, arbitrator);
    }

    function _networkName(uint256 chainId) internal pure returns (string memory) {
        if (chainId == 43113) return "avalanche-fuji";
        if (chainId == 43114) return "avalanche-mainnet";
        if (chainId == 31337) return "anvil";
        return "unknown";
    }

    function _writeDeployment(string memory network, address escrow, address deployer, address admin, address arbitrator)
        internal
    {
        string memory json = "deployment";
        vm.serializeString(json, "network", network);
        vm.serializeUint(json, "chainId", block.chainid);
        vm.serializeAddress(json, "contract", escrow);
        vm.serializeAddress(json, "deployer", deployer);
        vm.serializeAddress(json, "admin", admin);
        vm.serializeAddress(json, "arbitrator", arbitrator);
        string memory out = vm.serializeUint(json, "deployedAt", block.timestamp);
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(out, path);
        console.log("Saved deployment record to", path);
    }
}
