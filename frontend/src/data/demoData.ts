export const DEMO_DRIVERS = [
    { name: "Max Verstappen", car: "Red Bull RB19", station: "1" },
    { name: "Lando Norris", car: "McLaren MCL60", station: "2" },
    { name: "Fernando Alonso", car: "Aston Martin AMR23", station: "3" },
    { name: "Lewis Hamilton", car: "Mercedes W14", station: "4" },
    { name: "Charles Leclerc", car: "Ferrari SF-23", station: "5" },
    { name: "Carlos Sainz", car: "Ferrari SF-23", station: "6" }
];

export const DEMO_LEADERBOARD = [
    { rank: 1, driver_name: "Max Verstappen", car_model: "Red Bull", track_name: "Monza", lap_time: 84300, timestamp: new Date().toISOString(), gap: 0, lap_id: 1 },
    { rank: 2, driver_name: "Lando Norris", car_model: "McLaren", track_name: "Monza", lap_time: 84450, timestamp: new Date().toISOString(), gap: 150, lap_id: 2 },
    { rank: 3, driver_name: "Fernando Alonso", car_model: "Aston Martin", track_name: "Monza", lap_time: 84800, timestamp: new Date().toISOString(), gap: 500, lap_id: 3 },
    { rank: 4, driver_name: "Lewis Hamilton", car_model: "Mercedes", track_name: "Monza", lap_time: 85100, timestamp: new Date().toISOString(), gap: 800, lap_id: 4 },
    { rank: 5, driver_name: "Charles Leclerc", car_model: "Ferrari", track_name: "Monza", lap_time: 85300, timestamp: new Date().toISOString(), gap: 1000, lap_id: 5 }
];

export const DEMO_HALL_OF_FAME = [
    {
        track_name: "Monza",
        car_model: "GT3",
        records: [
            { driver_name: "Alien_01", lap_time: 106500, date: new Date().toISOString() },
            { driver_name: "SimRacerX", lap_time: 107200, date: new Date().toISOString() },
            { driver_name: "ProDriver", lap_time: 107800, date: new Date().toISOString() }
        ]
    }
];

export const DEMO_TOURNAMENT = {
    name: "Copa de Invierno 2026",
    matches: [
        [ // Round 1
            { id: 1, round: 0, match_num: 1, player1: "Max", player2: "Lewis", winner: "Max", score1: 2, score2: 1 },
            { id: 2, round: 0, match_num: 2, player1: "Lando", player2: "Fernando", winner: "Lando", score1: 2, score2: 0 }
        ],
        [ // Final
            { id: 3, round: 1, match_num: 1, player1: "Max", player2: "Lando", winner: null, score1: 0, score2: 0 }
        ]
    ]
};

export const DEMO_STATIONS = [
    { id: 1, name: "Station 1", ip_address: "192.168.1.101", is_streaming: false, stream_url: null },
    { id: 2, name: "Station 2", ip_address: "192.168.1.102", is_streaming: false, stream_url: null },
    { id: 3, name: "Station 3", ip_address: "192.168.1.103", is_streaming: false, stream_url: null },
    { id: 4, name: "Station 4", ip_address: "192.168.1.104", is_streaming: false, stream_url: null }
];
