# xikipedia-rn
Wikipedia as a social media feed (React Native version)

# About

Xikipedia is a pseudo social media feed that algorithmically shows you content from [Simple Wikipedia](https://simple.wikipedia.org/). It is made as a demonstration of how even a basic non-ML algorithm with no data from other users can quickly learn what you engage with to suggest you more similar content. The algorithm runs locally and no data leaves your device.

This is the React Native version of the project, built for a smoother mobile experience with a native SQLite database for high-performance offline doomscrolling.

## Generating data

To run Xikipedia, you need the `xikipedia.db` SQLite file in the `assets/` directory. 

1. Use `process_data.py` (from the main project) to generate `smoldata.json`.
2. Run `python3 convert_to_sqlite.py` to convert the JSON data into the optimized SQLite database used by the mobile app.

## Algorithm

The algorithm used for Xikipedia is pretty simple. Each post has a set of categories, which consists of the post's Wikipedia category tree, and the pagelinks in the post. These categories have point scores assigned to them.

Here are the actions and their respective scores:

- Scrolling past a post: -5
- Liking a post: 50 + 4*posts_since_last_like
- Clicking on an article: 75
- Clicking on an image: 100

These scores are applied through the `engagePost` function in the `Algorithm.ts` component.

Each post has a base score, which is 0 by default. If a post has an image, it gets +5 on its base score. If you've already seen a post, its base score will be `(3**(post_seen_times)-1) * -5000`.

To get the next post in the feed, 1000 random posts are picked out from the dataset. Then, one of three things will randomly happen:

- (40% chance) The scores of all posts are summed together, and a random value is picked. It's kind of like picking a random value, except posts with higher scores have a higher likelihood of getting picked.
- (42% chance) The post with the highest score is shown.
- (18% chance) A completely random post is shown.

The categories `given names` and `surnames` start off with a base score of -1000 due to how prevalent they would be otherwise.

## Tech Stack

- **Framework**: Expo (React Native)
- **Navigation**: Expo Router
- **Database**: Expo SQLite (Next)
- **Animations**: React Native Reanimated
- **Icons**: Lucide React Native
- **Image Loading**: Expo Image

## Changelog

### 2026-05-29

- Initial React Native release!
- Ported algorithm to native SQLite for massive performance gains
- Full offline support with bundled 300MB+ dataset
- Modern "Twitter-style" dark theme UI
- Real-time interest statistics and profile management
- Haptic feedback and spring animations for engagement
- Fixed hardware back button behavior for image viewing

## Licensing

This project is licensed under AGPLv3. This license applies to the project itself, but not the included database file that contains data from Wikipedia. If you'd like to use this project, but can't use it due to its current license, let me know and I might relicense it.
