import socket
import struct

def send_magic_packet(mac_address: str, broadcast_ip: str = "255.255.255.255", port: int = 9):
    """
    Sends a Wake-On-LAN magic packet to the specified MAC address.
    
    Args:
        mac_address (str): The MAC address of the target device (e.g., "AA:BB:CC:DD:EE:FF").
        broadcast_ip (str): The broadcast IP address of the network (default: "255.255.255.255").
        port (int): The port to send the packet to (default: 9).
    """
    try:
        # Remove separators and convert to bytes
        mac_clean = mac_address.replace(":", "").replace("-", "")
        if len(mac_clean) != 12:
            raise ValueError(f"Invalid MAC address format: {mac_address}")
            
        # Magic Packet: 6 * 0xFF followed by 16 * MAC Address
        mac_bytes = bytes.fromhex(mac_clean)
        packet = b'\xff' * 6 + (mac_bytes * 16)
        
        # Create socket and send packet
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            sock.sendto(packet, (broadcast_ip, port))
            
        print(f"WoL packet sent to {mac_address}")
        return True
    except Exception as e:
        print(f"Error sending WoL packet: {e}")
        return False
