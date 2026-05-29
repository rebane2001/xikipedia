# xikipedia
Wikipedia as a social media feed

# Try it: [xikipedia.org](https://xikipedia.org/)

[React Native version available in /mobile]

## About

Xikipedia is a pseudo social media feed that algorithmically shows you content from [Simple Wikipedia](https://simple.wikipedia.org/). It is made as a demonstration of how even a basic non-ML algorithm with no data from other users can quickly learn what you engage with to suggest you more similar content. The algorithm runs locally and no data leaves your device.

Once Xikipedia has loaded, it is available fully offline, and you can even install it as an app by clicking the install button.

## Generating data

To run Xikipedia, you need the .json file that contains the data required. This repo already has a file for the Simple Wikipedia included, but you can also make your own by replacing the files in the `process_data.py` file with your own [WikiMedia data dumps](https://dumps.wikimedia.org/).

## Algorithm

The algorithm used for Xikipedia is pretty simple. Each post has a set of categories, which consists of the post's Wikipedia category tree, and the pagelinks in the post. These categories have point scores assigned to them.

Here are the actions and their respective scores:

- Scrolling past a post: -5
- Liking a post: 50 + 4*posts_since_last_like
- Clicking on an article: 75
- Clicking on an image: 100

These scores are applied through the `engagePost` function in the code.

Each post has a base score, which is 0 by default. If a post has an image, it gets +5 on its base score. If you've already seen a post, its base score will be `(3**(post_seen_times)-1) * -5000`.

To get the next post in the feed, 10000 random posts are picked out from the data set. Then, one of three things will randomly happen:

- (40% chance) The scores of all posts are summed together, and a random value is picked. It's kind of like picking a random value, except posts with higher scores have a higher likelyhood of getting picked.
- (42% chance) The post with the highest score is shown.
- (18% chance) A completely random post is shown.

The categories `given names` and `surnames` start off with a base score of -1000 due to how prevelant they would be otherwise.

## TODO

- Handle back button on phones.
- Maybe an iframe view that doesn't open a new tab.
- Renaming profiles.
- Reset algorithm without resetting time statistics.
- Handle updating the dataset in settings or something.
- Export/import profiles (algorithm data).

## Changelog

Loose changelog, check the commit history for more detail.

### 2026-02-06

- Now available as an app (PWA)!
- Fully available offline through Service Workers
- Algorithm data persistence (optional)
- Navbar and its icons (made by yours truly)
- Settings menu
- Light theme
- Ability to choose between English and Simple Wikipedias for links
- Profiles, profile management
- Statistics
- About

### 2026-02-03

- More info in README
- Added algorithm script to repo
- Added iOS warning to start screen

### 2026-02-02

- Initial release

## Licensing

This project is licensed under AGPLv3. This license applies to the project itself, but not the included json file that contains data from Wikipedia. If you'd like to use this project, but can't use it due to its current license, let me know and I might relicense it.