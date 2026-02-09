#!/usr/bin/env python3
"""
Run all 100 test scenarios through the curator CLI and capture results.
"""
import json
import subprocess
import re
from pathlib import Path

# Load scenarios
with open('test-scenarios.json', 'r') as f:
    scenarios = json.load(f)

results = []

# Strategy mapping based on category and content
def determine_command(scenario):
    """Determine the best curator command for a scenario."""
    prompt = scenario['prompt'].lower()
    category = scenario['category']
    
    # Artist-based scenarios
    if category == 'artist-deep' or 'radiohead' in prompt or 'bowie' in prompt or 'mf doom' in prompt:
        if 'radiohead' in prompt:
            return 'discover --artists "Radiohead" --limit 15 --preview', 'Artist deep dive'
        elif 'bowie' in prompt:
            return 'discover --artists "David Bowie" --limit 15 --preview', 'Artist deep dive'
        elif 'mf doom' in prompt:
            return 'discover --artists "MF DOOM" --limit 20 --preview', 'Artist catalog'
    
    # Label-based scenarios
    if category == 'label':
        if 'warp' in prompt:
            return 'discover --label "Warp Records" --limit 15 --preview', 'Label discovery'
        elif 'ed banger' in prompt:
            return 'discover --label "Ed Banger Records" --limit 15 --preview', 'Label discovery'
        elif 'stones throw' in prompt:
            return 'discover --label "Stones Throw" --limit 15 --preview', 'Label discovery'
    
    # Era/decade-based with year filters
    if category in ['era', 'decade']:
        if '90s hip hop' in prompt or 'golden age hip hop' in prompt:
            return 'discover --artists "Wu-Tang Clan,Nas,A Tribe Called Quest,Notorious B.I.G." --year-min 1986 --year-max 1996 --limit 15 --preview', 'Golden age hip hop artists'
        elif 'punk rock' in prompt and '1976' in prompt:
            return 'discover --artists "Ramones,Sex Pistols,The Clash,Buzzcocks" --year-min 1976 --year-max 1979 --limit 15 --preview', 'Punk pioneers'
        elif '80s synthwave' in prompt or 'new wave' in prompt:
            return 'discover --genre "synthwave new wave 80s synth" --year-min 1980 --year-max 1989 --limit 15 --preview', '80s synth era'
        elif 'motown' in prompt and '60s' in prompt:
            return 'discover --artists "The Supremes,Marvin Gaye,Stevie Wonder,The Temptations" --year-min 1960 --year-max 1969 --limit 15 --preview', 'Motown legends'
        elif 'grunge' in prompt and 'seattle' in prompt:
            return 'discover --artists "Nirvana,Pearl Jam,Soundgarden,Alice in Chains" --year-min 1990 --year-max 1994 --limit 15 --preview', 'Grunge era'
        elif 'post-punk' in prompt:
            return 'discover --artists "Joy Division,Siouxsie and the Banshees,Gang of Four,Wire" --year-min 1978 --year-max 1985 --limit 15 --preview', 'Post-punk era'
        elif 'britpop' in prompt:
            return 'discover --artists "Oasis,Blur,Pulp,Suede" --year-min 1994 --year-max 1997 --limit 15 --preview', 'Britpop era'
        elif 'disco' in prompt and '1975' in prompt:
            return 'discover --artists "Donna Summer,Chic,Bee Gees,Gloria Gaynor" --year-min 1975 --year-max 1980 --limit 15 --preview', 'Disco era'
        elif 'proto-punk' in prompt or 'garage rock' in prompt and '60s' in prompt:
            return 'discover --artists "The Stooges,MC5,The Sonics,The Seeds" --year-min 1965 --year-max 1969 --limit 15 --preview', 'Proto-punk'
    
    # Genre-specific with well-known artists
    if category == 'genre':
        genre_artists = {
            'french electro': 'Daft Punk,Justice,Air,Phoenix',
            'bossa nova': 'João Gilberto,Antonio Carlos Jobim,Stan Getz,Astrud Gilberto',
            'detroit techno': 'Juan Atkins,Derrick May,Carl Craig,Jeff Mills',
            'afrobeat': 'Fela Kuti,Tony Allen,Antibalas,Seun Kuti',
            'minimal techno': 'Richie Hawtin,Robert Hood,Plastikman,Jeff Mills',
            'malian desert blues': 'Tinariwen,Ali Farka Touré,Bombino,Tamikrest',
            'dub reggae': 'Lee "Scratch" Perry,King Tubby,Scientist,Augustus Pablo',
            'krautrock': 'Can,Neu!,Kraftwerk,Tangerine Dream',
            'trip hop': 'Massive Attack,Portishead,Tricky,Morcheeba',
            'new orleans': 'Dr. John,The Meters,Professor Longhair,Preservation Hall Jazz Band',
            'chicago house': 'Frankie Knuckles,Marshall Jefferson,Larry Heard,Farley Jackmaster Funk',
            'flamenco': 'Paco de Lucía,Camarón de la Isla,Tomatito,Vicente Amigo',
            'uk garage': 'MJ Cole,Artful Dodger,Craig David,Oxide & Neutrino',
            'highlife': 'Fela Kuti,E.T. Mensah,Osibisa,Pat Thomas',
            'italo': 'Giorgio Moroder,Gazebo,Righeira,Baltimora',
            'memphis rap': 'Three 6 Mafia,Project Pat,8Ball & MJG,Tommy Wright III',
            'cumbia': 'Los Ángeles Azules,Bomba Estéreo,Sonora Dinamita,Celso Piña',
            'shoegaze': 'My Bloody Valentine,Slowdive,Ride,Lush',
            'k-pop': 'BTS,BLACKPINK,EXO,TWICE',
            'ethiopian jazz': 'Mulatu Astatke,Getatchew Mekurya,Alemayehu Eshete,Mahmoud Ahmed',
            'drum and bass': 'Calibre,High Contrast,Netsky,Logistics',
            'tuareg': 'Tinariwen,Bombino,Terakaft,Tamikrest',
            'grime': 'Wiley,Skepta,Dizzee Rascal,JME',
            'turkish psych': 'Erkin Koray,Barış Manço,Selda Bağcan,Moğollar',
            'fado': 'Amália Rodrigues,Mariza,Carlos do Carmo,Carminho',
            'city pop': 'Tatsuro Yamashita,Mariya Takeuchi,Anri,Junko Yagami'
        }
        
        for key, artists in genre_artists.items():
            if key in prompt:
                return f'discover --artists "{artists}" --limit 15 --preview', f'{key.title()} artists'
    
    # Road trip scenarios
    if category == 'road-trip':
        if 'california' in prompt:
            return 'discover --artists "Eagles,Fleetwood Mac,Tom Petty" --limit 10 --preview', 'Classic rock road trip'
        elif 'desert' in prompt:
            return 'discover --artists "Queens of the Stone Age,Kyuss,The Desert Sessions" --limit 10 --preview', 'Desert rock'
        elif '2am' in prompt and 'highway' in prompt:
            return 'discover --artists "M83,Kavinsky,The Midnight" --limit 10 --preview', 'Night driving synthwave'
    
    # Mood-based
    if category == 'mood':
        if 'chill' in prompt and 'sunday' in prompt and 'coffee' in prompt:
            return 'discover --artists "Norah Jones,José González,Iron & Wine,Nick Drake" --limit 10 --preview', 'Chill acoustic'
        elif 'sad' in prompt and 'rainy' in prompt and 'indie' in prompt:
            return 'discover --artists "Bon Iver,The National,Elliott Smith,Phoebe Bridgers" --limit 10 --preview', 'Sad indie'
        elif 'lo-fi beats' in prompt:
            return 'discover --artists "Nujabes,J Dilla,Jinsang,idealism" --limit 10 --preview', 'Lo-fi hip hop'
        elif 'main character' in prompt:
            return 'discover --artists "Lana Del Rey,The 1975,Arctic Monkeys,The Neighbourhood" --limit 10 --preview', 'Main character vibes'
        elif 'breakup' in prompt and 'angry' in prompt:
            return 'discover --artists "Alanis Morissette,Yeah Yeah Yeahs,Lizzo,Olivia Rodrigo" --limit 10 --preview', 'Angry breakup'
        elif 'euphoric' in prompt and 'festival' in prompt:
            return 'discover --artists "Avicii,Swedish House Mafia,Zedd,Calvin Harris" --limit 10 --preview', 'Festival anthems'
        elif 'melancholic piano' in prompt:
            return 'discover --artists "Ludovico Einaudi,Ólafur Arnalds,Nils Frahm,Max Richter" --limit 10 --preview', 'Melancholic piano'
        elif 'feel-good summer' in prompt:
            return 'discover --artists "Pharrell Williams,Outkast,Mark Ronson,Vampire Weekend" --limit 10 --preview', 'Summer hits'
        elif 'train window' in prompt:
            return 'discover --artists "Sigur Rós,Explosions in the Sky,Mogwai,God Is an Astronaut" --limit 10 --preview', 'Contemplative post-rock'
        elif 'peaceful acoustic folk' in prompt:
            return 'discover --artists "Simon & Garfunkel,Nick Drake,José González,Sufjan Stevens" --limit 10 --preview', 'Folk classics'
        elif 'outer space' in prompt:
            return 'discover --artists "Boards of Canada,Aphex Twin,Brian Eno,Vangelis" --limit 10 --preview', 'Space ambient'
        elif 'triumphant' in prompt and 'orchestral' in prompt:
            return 'discover --artists "Hans Zimmer,John Williams,Two Steps From Hell,Audiomachine" --limit 10 --preview', 'Epic orchestral'
        elif 'fincher movie' in prompt or 'dark and brooding' in prompt:
            return 'discover --artists "Trent Reznor,Atticus Ross,Cliff Martinez,David Holmes" --limit 10 --preview', 'Dark cinematic'
        elif 'nostalgic' in prompt and 'bittersweet' in prompt:
            return 'discover --artists "The Smiths,Mazzy Star,Cocteau Twins,Beach House" --limit 10 --preview', 'Nostalgic indie'
        elif 'angry' in prompt and 'break something' in prompt:
            return 'discover --artists "Rage Against the Machine,System of a Down,Tool,Deftones" --limit 10 --preview', 'Angry metal'
        elif 'dreamy' in prompt and 'floaty' in prompt:
            return 'discover --artists "Cocteau Twins,Beach House,Mazzy Star,Slowdive" --limit 10 --preview', 'Dream pop'
        elif 'cozy winter' in prompt and 'fireplace' in prompt:
            return 'discover --artists "Sufjan Stevens,Vince Guaraldi Trio,Fleet Foxes,Bon Iver" --limit 10 --preview', 'Cozy folk'
        elif 'tension' in prompt or 'something is about to happen' in prompt:
            return 'discover --artists "Massive Attack,Portishead,Nine Inch Nails,Radiohead" --limit 10 --preview', 'Tense electronic'
        elif 'wes anderson' in prompt or 'playful and quirky' in prompt:
            return 'discover --artists "The Kinks,Belle and Sebastian,Sufjan Stevens,The Shins" --limit 10 --preview', 'Quirky indie'
        elif 'pure joy' in prompt or 'dance alone in your kitchen' in prompt:
            return 'discover --artists "ABBA,Earth Wind & Fire,Stevie Wonder,Lizzo" --limit 10 --preview', 'Joy and dance'
    
    # Activity-based
    if category == 'activity':
        if 'dinner party jazz' in prompt:
            return 'discover --artists "Miles Davis,John Coltrane,Bill Evans,Chet Baker" --limit 10 --preview', 'Dinner jazz'
        elif 'cooking italian' in prompt:
            return 'discover --artists "Ennio Morricone,Andrea Bocelli,Dean Martin,Luciano Pavarotti" --limit 10 --preview', 'Italian classics'
        elif 'board game' in prompt:
            return 'discover --artists "Yann Tiersen,Penguin Cafe Orchestra,Ólafur Arnalds,GoGo Penguin" --limit 10 --preview', 'Background instrumental'
        elif 'yoga' in prompt or 'meditation' in prompt:
            return 'discover --artists "Brian Eno,Laraaji,Deuter,Anugama" --limit 10 --preview', 'Meditation ambient'
        elif 'coding' in prompt or 'long night coding' in prompt:
            return 'discover --artists "Tycho,Bonobo,Caribou,Four Tet" --limit 10 --preview', 'Focus electronic'
        elif 'baby bath' in prompt:
            return 'discover --artists "Raffi,The Wiggles,Laurie Berkner,Elizabeth Mitchell" --limit 10 --preview', 'Kids music'
        elif 'morning run' in prompt:
            return 'discover --artists "LCD Soundsystem,Hot Chip,Cut Copy,M83" --limit 10 --preview', 'Upbeat indie dance'
        elif 'cleaning' in prompt and 'saturday morning' in prompt:
            return 'discover --artists "Lizzo,Dua Lipa,Harry Styles,Bruno Mars" --limit 10 --preview', 'Upbeat pop'
        elif 'train ride across europe' in prompt:
            return 'discover --artists "Ludovico Einaudi,Ólafur Arnalds,Max Richter,Nils Frahm" --limit 10 --preview', 'European classical'
        elif 'focus' in prompt and 'no lyrics' in prompt:
            return 'discover --artists "Nils Frahm,Jon Hopkins,Kiasmos,Ólafur Arnalds" --limit 10 --preview', 'Instrumental focus'
    
    # Scene-based
    if category == 'scene':
        if 'berlin club' in prompt and '5am' in prompt:
            return 'discover --artists "Dixon,Âme,Ben Klock,Marcel Dettmann" --limit 10 --preview', 'Berlin techno comedown'
        elif 'sci-fi novel' in prompt:
            return 'discover --artists "Vangelis,Jean-Michel Jarre,Tangerine Dream,Brian Eno" --limit 10 --preview', 'Sci-fi ambient'
        elif 'friday night' in prompt and 'getting ready' in prompt:
            return 'discover --artists "Dua Lipa,The Weeknd,Doja Cat,Calvin Harris" --limit 10 --preview', 'Pre-party hype'
        elif 'tokyo' in prompt and 'neon' in prompt:
            return 'discover --artists "Tatsuro Yamashita,Casiopea,Yellow Magic Orchestra,Nujabes" --limit 10 --preview', 'Tokyo city pop'
        elif 'last day of summer' in prompt and 'sunset' in prompt:
            return 'discover --artists "Tame Impala,Beach House,MGMT,Real Estate" --limit 10 --preview', 'Summer sunset'
        elif 'beach bar' in prompt and 'bali' in prompt:
            return 'discover --artists "Khruangbin,Bonobo,FKJ,Tom Misch" --limit 10 --preview', 'Chill beach vibes'
        elif 'heist movie' in prompt:
            return 'discover --artists "Junkie XL,The Chemical Brothers,The Prodigy,Fatboy Slim" --limit 10 --preview', 'High energy action'
        elif 'foggy forest' in prompt and 'dawn' in prompt:
            return 'discover --artists "Sigur Rós,Jóhann Jóhannsson,Hildur Guðnadóttir,Ólafur Arnalds" --limit 10 --preview', 'Nordic ambient'
        elif 'rooftop' in prompt and 'sunrise' in prompt and 'all-night party' in prompt:
            return 'discover --artists "Bonobo,Four Tet,Jamie xx,The xx" --limit 10 --preview', 'Post-party sunrise'
    
    # Workout
    if category == 'workout':
        return 'discover --artists "The Prodigy,Pendulum,Chase & Status,Knife Party" --limit 10 --preview', 'High energy electronic'
    
    # Specific/complex
    if 'bass solo' in prompt:
        return 'discover --artists "Jaco Pastorius,Victor Wooten,Flea,Les Claypool" --limit 10 --preview', 'Bass virtuosos'
    elif 'guitar riff' in prompt:
        return 'discover --artists "Led Zeppelin,Black Sabbath,Deep Purple,AC/DC" --limit 10 --preview', 'Guitar riff legends'
    elif 'james brown' in prompt and 'sample' in prompt:
        return 'discover --artists "Public Enemy,Beastie Boys,N.W.A,Eric B. & Rakim" --limit 10 --preview', 'Hip hop sampling classics'
    elif 'drum break' in prompt:
        return 'discover --artists "The Winstons,The Incredible Bongo Band,James Brown,Clyde Stubblefield" --limit 10 --preview', 'Breakbeat classics'
    elif 'synth lines' in prompt or 'iconic synth' in prompt:
        return 'discover --artists "Gary Numan,Kraftwerk,Depeche Mode,New Order" --limit 10 --preview', 'Synth pioneers'
    elif 'famous bassline' in prompt:
        return 'discover --artists "Queen,Michael Jackson,Chic,Red Hot Chili Peppers" --limit 10 --preview', 'Iconic basslines'
    elif 'vocoder' in prompt:
        return 'discover --artists "Daft Punk,Kraftwerk,Zapp,Roger Troutman" --limit 10 --preview', 'Vocoder masters'
    elif 'one-hit wonder' in prompt:
        return 'discover --artists "A-ha,Soft Cell,Dexys Midnight Runners,Right Said Fred" --limit 10 --preview', 'One hit wonders'
    elif 'live version better' in prompt:
        return 'discover --artists "Nirvana,Johnny Cash,Queen,Talking Heads" --limit 10 --preview', 'Live performance legends'
    elif 'album opener' in prompt:
        return 'discover --artists "The Beatles,Pink Floyd,Radiohead,Kendrick Lamar" --limit 10 --preview', 'Epic album openers'
    elif 'most influential' in prompt or 'changed music forever' in prompt:
        return 'discover --artists "The Beatles,Bob Dylan,Kraftwerk,Miles Davis" --limit 10 --preview', 'Music pioneers'
    elif 'starts mellow' in prompt and 'builds' in prompt:
        return 'discover --artists "Fleet Foxes,Radiohead,Sigur Rós,Explosions in the Sky" --limit 15 --preview', 'Dynamic progression'
    elif 'every continent' in prompt:
        return 'discover --artists "Fela Kuti,Ravi Shankar,Bob Marley,Astor Piazzolla,Tinariwen,Gipsy Kings,Youssou N\'Dour,Ali Farka Touré" --limit 20 --preview', 'World music icons'
    
    # Fallback: use genre keywords
    return f'discover --genre "{prompt[:50]}" --limit 10 --preview', 'Generic keyword search'

def run_command(cmd):
    """Run curator command and capture output."""
    try:
        result = subprocess.run(
            f'cd ~/clawd/projects/curator && node dist/cli.js {cmd}',
            shell=True,
            capture_output=True,
            text=True,
            timeout=30
        )
        return result.stdout, result.stderr, result.returncode
    except subprocess.TimeoutExpired:
        return '', 'Command timed out', 1

def extract_tracks(output):
    """Extract track list from command output."""
    tracks = []
    lines = output.split('\n')
    for line in lines:
        # Match lines like: "  1. Song Title - Artist Name (Album, Year) [Duration]"
        match = re.match(r'\s+\d+\.\s+(.+?)\s+-\s+(.+?)\s+\(', line)
        if match:
            title = match.group(1)
            artist = match.group(2)
            tracks.append(f"{artist} - {title}")
    return tracks

print("Starting test run of 100 scenarios...")
print("=" * 80)

for i, scenario in enumerate(scenarios, 1):
    print(f"\n[{i}/100] Processing: {scenario['prompt'][:60]}...")
    
    cmd, approach = determine_command(scenario)
    print(f"  Strategy: {approach}")
    print(f"  Command: {cmd[:80]}...")
    
    stdout, stderr, code = run_command(cmd)
    tracks = extract_tracks(stdout)
    
    retried = False
    
    # Retry logic if no tracks found
    if len(tracks) == 0 and code != 0:
        print(f"  ⚠ No results, retrying with different approach...")
        # Try a simpler genre search as fallback
        fallback_cmd = f'discover --genre "{scenario["prompt"][:30]}" --limit 10 --preview'
        stdout2, stderr2, code2 = run_command(fallback_cmd)
        tracks2 = extract_tracks(stdout2)
        if len(tracks2) > len(tracks):
            tracks = tracks2
            cmd = fallback_cmd
            approach = "Fallback: generic search"
            retried = True
            print(f"  ✓ Retry succeeded: {len(tracks)} tracks")
    
    result = {
        "id": scenario['id'],
        "prompt": scenario['prompt'],
        "command": cmd,
        "approach": approach,
        "tracks": tracks[:20],  # Cap at 20 for readability
        "trackCount": len(tracks),
        "retried": retried,
        "notes": f"Exit code: {code}. " + (stderr[:100] if stderr and code != 0 else "Success")
    }
    
    results.append(result)
    print(f"  ✓ {len(tracks)} tracks captured")

print("\n" + "=" * 80)
print(f"Completed all 100 scenarios!")
print(f"Writing results to test-results.json...")

with open('test-results.json', 'w') as f:
    json.dump(results, f, indent=2)

print("✓ Done!")
