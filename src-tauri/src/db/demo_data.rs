use rusqlite::{params, Connection, Result};

pub struct DemoProduct {
    pub code: &'static str,
    pub name: &'static str,
    pub category_name: &'static str,
    pub price_paise: i64,
    pub gst_enabled: bool,
    pub gst_percentage_x100: i32,
    pub barcode: &'static str,
}

pub const DEMO_CATEGORIES: &[(&str, i32)] = &[
    ("Juice & Beverages", 1),
    ("Snacks & Chaat", 2),
    ("Fast Food & Burgers", 3),
    ("Ice Cream & Desserts", 4),
    ("Bakery & Pastries", 5),
    ("Tea & Coffee", 6),
    ("Meals & Combos", 7),
    ("Packaged Goods", 8),
];

pub const DEMO_PRODUCTS: &[DemoProduct] = &[
    // Category 1: Juice & Beverages (18 items)
    DemoProduct { code: "JUC001", name: "Fresh Apple Juice", category_name: "Juice & Beverages", price_paise: 8000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8901001" },
    DemoProduct { code: "JUC002", name: "Fresh Orange Juice", category_name: "Juice & Beverages", price_paise: 7000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8901002" },
    DemoProduct { code: "JUC003", name: "Pomegranate Juice", category_name: "Juice & Beverages", price_paise: 9000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8901003" },
    DemoProduct { code: "JUC004", name: "Sweet Lime (Mosambi) Juice", category_name: "Juice & Beverages", price_paise: 6000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8901004" },
    DemoProduct { code: "JUC005", name: "Watermelon Juice", category_name: "Juice & Beverages", price_paise: 5000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8901005" },
    DemoProduct { code: "JUC006", name: "Pineapple Juice", category_name: "Juice & Beverages", price_paise: 7000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8901006" },
    DemoProduct { code: "JUC007", name: "Fresh Mango Juice", category_name: "Juice & Beverages", price_paise: 8000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8901007" },
    DemoProduct { code: "JUC008", name: "Fresh Grape Juice", category_name: "Juice & Beverages", price_paise: 7000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8901008" },
    DemoProduct { code: "JUC009", name: "Mixed Fruit Juice", category_name: "Juice & Beverages", price_paise: 9000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8901009" },
    DemoProduct { code: "JUC010", name: "Fresh Lemonade", category_name: "Juice & Beverages", price_paise: 3000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8901010" },
    DemoProduct { code: "JUC011", name: "Mint Lime Cooler", category_name: "Juice & Beverages", price_paise: 4000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8901011" },
    DemoProduct { code: "JUC012", name: "Blue Curacao Mocktail", category_name: "Juice & Beverages", price_paise: 9000, gst_enabled: true, gst_percentage_x100: 1200, barcode: "8901012" },
    DemoProduct { code: "JUC013", name: "Virgin Mojito", category_name: "Juice & Beverages", price_paise: 9000, gst_enabled: true, gst_percentage_x100: 1200, barcode: "8901013" },
    DemoProduct { code: "JUC014", name: "Green Apple Soda", category_name: "Juice & Beverages", price_paise: 7000, gst_enabled: true, gst_percentage_x100: 1200, barcode: "8901014" },
    DemoProduct { code: "JUC015", name: "Tender Coconut Water", category_name: "Juice & Beverages", price_paise: 5000, gst_enabled: false, gst_percentage_x100: 0, barcode: "8901015" },
    DemoProduct { code: "JUC016", name: "Sugarcane Juice", category_name: "Juice & Beverages", price_paise: 4000, gst_enabled: false, gst_percentage_x100: 0, barcode: "8901016" },
    DemoProduct { code: "JUC017", name: "Strawberry Milkshake", category_name: "Juice & Beverages", price_paise: 9000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8901017" },
    DemoProduct { code: "JUC018", name: "Chocolate Thick Shake", category_name: "Juice & Beverages", price_paise: 11000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8901018" },

    // Category 2: Snacks & Chaat (18 items)
    DemoProduct { code: "SNK001", name: "Vegetable Samosa (2 pcs)", category_name: "Snacks & Chaat", price_paise: 3000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8902001" },
    DemoProduct { code: "SNK002", name: "Paneer Samosa (2 pcs)", category_name: "Snacks & Chaat", price_paise: 5000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8902002" },
    DemoProduct { code: "SNK003", name: "Crispy Veg Puff", category_name: "Snacks & Chaat", price_paise: 2500, gst_enabled: true, gst_percentage_x100: 500, barcode: "8902003" },
    DemoProduct { code: "SNK004", name: "Paneer Butter Puff", category_name: "Snacks & Chaat", price_paise: 3500, gst_enabled: true, gst_percentage_x100: 500, barcode: "8902004" },
    DemoProduct { code: "SNK005", name: "Egg Puff", category_name: "Snacks & Chaat", price_paise: 3000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8902005" },
    DemoProduct { code: "SNK006", name: "Chicken Tikka Puff", category_name: "Snacks & Chaat", price_paise: 4500, gst_enabled: true, gst_percentage_x100: 500, barcode: "8902006" },
    DemoProduct { code: "SNK007", name: "Salted French Fries", category_name: "Snacks & Chaat", price_paise: 8000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8902007" },
    DemoProduct { code: "SNK008", name: "Peri Peri Fries", category_name: "Snacks & Chaat", price_paise: 9500, gst_enabled: true, gst_percentage_x100: 500, barcode: "8902008" },
    DemoProduct { code: "SNK009", name: "Cheese Loaded Fries", category_name: "Snacks & Chaat", price_paise: 12000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8902009" },
    DemoProduct { code: "SNK010", name: "Crispy Onion Rings", category_name: "Snacks & Chaat", price_paise: 7000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8902010" },
    DemoProduct { code: "SNK011", name: "Pani Puri (6 pcs)", category_name: "Snacks & Chaat", price_paise: 4000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8902011" },
    DemoProduct { code: "SNK012", name: "Sev Puri (6 pcs)", category_name: "Snacks & Chaat", price_paise: 5000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8902012" },
    DemoProduct { code: "SNK013", name: "Bhel Puri", category_name: "Snacks & Chaat", price_paise: 5000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8902013" },
    DemoProduct { code: "SNK014", name: "Dahi Puri (6 pcs)", category_name: "Snacks & Chaat", price_paise: 6000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8902014" },
    DemoProduct { code: "SNK015", name: "Samosa Chaat", category_name: "Snacks & Chaat", price_paise: 6000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8902015" },
    DemoProduct { code: "SNK016", name: "Aloo Tikki Chaat", category_name: "Snacks & Chaat", price_paise: 6000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8902016" },
    DemoProduct { code: "SNK017", name: "Cheese Corn Nuggets (6 pcs)", category_name: "Snacks & Chaat", price_paise: 9000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8902017" },
    DemoProduct { code: "SNK018", name: "Crispy Veg Spring Roll (4 pcs)", category_name: "Snacks & Chaat", price_paise: 8000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8902018" },

    // Category 3: Fast Food & Burgers (18 items)
    DemoProduct { code: "FST001", name: "Classic Veg Burger", category_name: "Fast Food & Burgers", price_paise: 8000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8903001" },
    DemoProduct { code: "FST002", name: "Veg Cheese Burger", category_name: "Fast Food & Burgers", price_paise: 10000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8903002" },
    DemoProduct { code: "FST003", name: "Crispy Paneer Burger", category_name: "Fast Food & Burgers", price_paise: 13000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8903003" },
    DemoProduct { code: "FST004", name: "Crispy Chicken Burger", category_name: "Fast Food & Burgers", price_paise: 12000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8903004" },
    DemoProduct { code: "FST005", name: "Double Cheese Supreme Burger", category_name: "Fast Food & Burgers", price_paise: 15000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8903005" },
    DemoProduct { code: "FST006", name: "Margherita Pizza 8\"", category_name: "Fast Food & Burgers", price_paise: 14000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8903006" },
    DemoProduct { code: "FST007", name: "Farmhouse Veggie Pizza 8\"", category_name: "Fast Food & Burgers", price_paise: 18000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8903007" },
    DemoProduct { code: "FST008", name: "Paneer Tikka Pizza 8\"", category_name: "Fast Food & Burgers", price_paise: 21000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8903008" },
    DemoProduct { code: "FST009", name: "BBQ Chicken Pizza 8\"", category_name: "Fast Food & Burgers", price_paise: 23000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8903009" },
    DemoProduct { code: "FST010", name: "Veg Grilled Sandwich", category_name: "Fast Food & Burgers", price_paise: 7000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8903010" },
    DemoProduct { code: "FST011", name: "Cheese Corn Grilled Sandwich", category_name: "Fast Food & Burgers", price_paise: 9000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8903011" },
    DemoProduct { code: "FST012", name: "Paneer Tikka Sandwich", category_name: "Fast Food & Burgers", price_paise: 11000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8903012" },
    DemoProduct { code: "FST013", name: "Chicken Club Sandwich", category_name: "Fast Food & Burgers", price_paise: 12000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8903013" },
    DemoProduct { code: "FST014", name: "Bombay Masala Toast", category_name: "Fast Food & Burgers", price_paise: 6000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8903014" },
    DemoProduct { code: "FST015", name: "Veg Hakka Noodles", category_name: "Fast Food & Burgers", price_paise: 11000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8903015" },
    DemoProduct { code: "FST016", name: "Schezwan Veg Noodles", category_name: "Fast Food & Burgers", price_paise: 12000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8903016" },
    DemoProduct { code: "FST017", name: "Veg Fried Rice", category_name: "Fast Food & Burgers", price_paise: 11000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8903017" },
    DemoProduct { code: "FST018", name: "Creamy White Sauce Pasta", category_name: "Fast Food & Burgers", price_paise: 14000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8903018" },

    // Category 4: Ice Cream & Desserts (16 items)
    DemoProduct { code: "ICM001", name: "Vanilla Ice Cream Scoop", category_name: "Ice Cream & Desserts", price_paise: 4000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8904001" },
    DemoProduct { code: "ICM002", name: "Chocolate Ice Cream Scoop", category_name: "Ice Cream & Desserts", price_paise: 5000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8904002" },
    DemoProduct { code: "ICM003", name: "Strawberry Ice Cream Scoop", category_name: "Ice Cream & Desserts", price_paise: 4500, gst_enabled: true, gst_percentage_x100: 500, barcode: "8904003" },
    DemoProduct { code: "ICM004", name: "Butterscotch Ice Cream Scoop", category_name: "Ice Cream & Desserts", price_paise: 5000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8904004" },
    DemoProduct { code: "ICM005", name: "Pista Kulfi Stick", category_name: "Ice Cream & Desserts", price_paise: 4000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8904005" },
    DemoProduct { code: "ICM006", name: "Malai Kulfi Stick", category_name: "Ice Cream & Desserts", price_paise: 4000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8904006" },
    DemoProduct { code: "ICM007", name: "Hot Fudge Chocolate Sundae", category_name: "Ice Cream & Desserts", price_paise: 11000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8904007" },
    DemoProduct { code: "ICM008", name: "Fresh Fruit Salad with Ice Cream", category_name: "Ice Cream & Desserts", price_paise: 10000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8904008" },
    DemoProduct { code: "ICM009", name: "Sizzling Brownie with Ice Cream", category_name: "Ice Cream & Desserts", price_paise: 14000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8904009" },
    DemoProduct { code: "ICM010", name: "Royal Falooda", category_name: "Ice Cream & Desserts", price_paise: 11000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8904010" },
    DemoProduct { code: "ICM011", name: "Kesar Pista Falooda", category_name: "Ice Cream & Desserts", price_paise: 12000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8904011" },
    DemoProduct { code: "ICM012", name: "Warm Gulab Jamun (2 pcs)", category_name: "Ice Cream & Desserts", price_paise: 4000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8904012" },
    DemoProduct { code: "ICM013", name: "Bengali Rasgulla (2 pcs)", category_name: "Ice Cream & Desserts", price_paise: 4000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8904013" },
    DemoProduct { code: "ICM014", name: "Kesar Rasmalai (2 pcs)", category_name: "Ice Cream & Desserts", price_paise: 6000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8904014" },
    DemoProduct { code: "ICM015", name: "Gajar Ka Halwa (100g)", category_name: "Ice Cream & Desserts", price_paise: 6000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8904015" },
    DemoProduct { code: "ICM016", name: "Mango Dolly Ice Bar", category_name: "Ice Cream & Desserts", price_paise: 3000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8904016" },

    // Category 5: Bakery & Pastries (14 items)
    DemoProduct { code: "BAK001", name: "Black Forest Pastry", category_name: "Bakery & Pastries", price_paise: 6000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8905001" },
    DemoProduct { code: "BAK002", name: "Chocolate Truffle Pastry", category_name: "Bakery & Pastries", price_paise: 7000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8905002" },
    DemoProduct { code: "BAK003", name: "Red Velvet Pastry", category_name: "Bakery & Pastries", price_paise: 7500, gst_enabled: true, gst_percentage_x100: 500, barcode: "8905003" },
    DemoProduct { code: "BAK004", name: "Fresh Pineapple Pastry", category_name: "Bakery & Pastries", price_paise: 5000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8905004" },
    DemoProduct { code: "BAK005", name: "Butterscotch Crunch Pastry", category_name: "Bakery & Pastries", price_paise: 5500, gst_enabled: true, gst_percentage_x100: 500, barcode: "8905005" },
    DemoProduct { code: "BAK006", name: "Chocolate Glazed Doughnut", category_name: "Bakery & Pastries", price_paise: 5000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8905006" },
    DemoProduct { code: "BAK007", name: "Cinnamon Sugar Doughnut", category_name: "Bakery & Pastries", price_paise: 4000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8905007" },
    DemoProduct { code: "BAK008", name: "Belgian Chocolate Cupcake", category_name: "Bakery & Pastries", price_paise: 3500, gst_enabled: true, gst_percentage_x100: 500, barcode: "8905008" },
    DemoProduct { code: "BAK009", name: "Vanilla Butter Cupcake", category_name: "Bakery & Pastries", price_paise: 3000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8905009" },
    DemoProduct { code: "BAK010", name: "Walnut Fudge Brownie", category_name: "Bakery & Pastries", price_paise: 6500, gst_enabled: true, gst_percentage_x100: 500, barcode: "8905010" },
    DemoProduct { code: "BAK011", name: "Choco Chip Cookies (200g)", category_name: "Bakery & Pastries", price_paise: 6000, gst_enabled: true, gst_percentage_x100: 1200, barcode: "8905011" },
    DemoProduct { code: "BAK012", name: "Butter Cashew Cookies (200g)", category_name: "Bakery & Pastries", price_paise: 7000, gst_enabled: true, gst_percentage_x100: 1200, barcode: "8905012" },
    DemoProduct { code: "BAK013", name: "Crispy Garlic Breadsticks", category_name: "Bakery & Pastries", price_paise: 6000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8905013" },
    DemoProduct { code: "BAK014", name: "Cheese Stuffed Garlic Bread", category_name: "Bakery & Pastries", price_paise: 9000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8905014" },

    // Category 6: Tea & Coffee (12 items)
    DemoProduct { code: "HOT001", name: "Masala Chai", category_name: "Tea & Coffee", price_paise: 2000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8906001" },
    DemoProduct { code: "HOT002", name: "Adrak Elaichi Chai", category_name: "Tea & Coffee", price_paise: 2500, gst_enabled: true, gst_percentage_x100: 500, barcode: "8906002" },
    DemoProduct { code: "HOT003", name: "South Indian Filter Coffee", category_name: "Tea & Coffee", price_paise: 3000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8906003" },
    DemoProduct { code: "HOT004", name: "Hot Chocolate with Marshmallows", category_name: "Tea & Coffee", price_paise: 6000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8906004" },
    DemoProduct { code: "HOT005", name: "Single Shot Espresso", category_name: "Tea & Coffee", price_paise: 5000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8906005" },
    DemoProduct { code: "HOT006", name: "Creamy Cappuccino", category_name: "Tea & Coffee", price_paise: 7000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8906006" },
    DemoProduct { code: "HOT007", name: "Cafe Latte", category_name: "Tea & Coffee", price_paise: 7500, gst_enabled: true, gst_percentage_x100: 500, barcode: "8906007" },
    DemoProduct { code: "HOT008", name: "Cold Coffee with Vanilla Scoop", category_name: "Tea & Coffee", price_paise: 9000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8906008" },
    DemoProduct { code: "HOT009", name: "Iced Cafe Mocha", category_name: "Tea & Coffee", price_paise: 10000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8906009" },
    DemoProduct { code: "HOT010", name: "Organic Honey Green Tea", category_name: "Tea & Coffee", price_paise: 3000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8906010" },
    DemoProduct { code: "HOT011", name: "Hot Badam Drink", category_name: "Tea & Coffee", price_paise: 4000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8906011" },
    DemoProduct { code: "HOT012", name: "Chilled Pista Milk", category_name: "Tea & Coffee", price_paise: 4500, gst_enabled: true, gst_percentage_x100: 500, barcode: "8906012" },

    // Category 7: Meals & Combos (10 items)
    DemoProduct { code: "MEL001", name: "Special Mini Tiffin Combo", category_name: "Meals & Combos", price_paise: 11000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8907001" },
    DemoProduct { code: "MEL002", name: "Crispy Ghee Roast Dosa", category_name: "Meals & Combos", price_paise: 7000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8907002" },
    DemoProduct { code: "MEL003", name: "Classic Masala Dosa", category_name: "Meals & Combos", price_paise: 6000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8907003" },
    DemoProduct { code: "MEL004", name: "Paneer Masala Dosa", category_name: "Meals & Combos", price_paise: 9000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8907004" },
    DemoProduct { code: "MEL005", name: "Idli (2) + Medu Vada (1) Combo", category_name: "Meals & Combos", price_paise: 5000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8907005" },
    DemoProduct { code: "MEL006", name: "Hot Poori Masala (3 pcs)", category_name: "Meals & Combos", price_paise: 6000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8907006" },
    DemoProduct { code: "MEL007", name: "Executive South Indian Thali", category_name: "Meals & Combos", price_paise: 14000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8907007" },
    DemoProduct { code: "MEL008", name: "Tempered Curd Rice with Pickle", category_name: "Meals & Combos", price_paise: 5000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8907008" },
    DemoProduct { code: "MEL009", name: "Burger + Fries + Drink Combo", category_name: "Meals & Combos", price_paise: 16000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8907009" },
    DemoProduct { code: "MEL010", name: "Pizza + Garlic Bread + Drink Combo", category_name: "Meals & Combos", price_paise: 24000, gst_enabled: true, gst_percentage_x100: 500, barcode: "8907010" },

    // Category 8: Packaged Goods (10 items)
    DemoProduct { code: "PKG001", name: "Packaged Mineral Water 1L", category_name: "Packaged Goods", price_paise: 2000, gst_enabled: true, gst_percentage_x100: 1800, barcode: "8908001" },
    DemoProduct { code: "PKG002", name: "Mineral Water 500ml", category_name: "Packaged Goods", price_paise: 1000, gst_enabled: true, gst_percentage_x100: 1800, barcode: "8908002" },
    DemoProduct { code: "PKG003", name: "Classic Salted Potato Chips 50g", category_name: "Packaged Goods", price_paise: 2000, gst_enabled: true, gst_percentage_x100: 1200, barcode: "8908003" },
    DemoProduct { code: "PKG004", name: "Spicy Masala Potato Chips 50g", category_name: "Packaged Goods", price_paise: 2000, gst_enabled: true, gst_percentage_x100: 1200, barcode: "8908004" },
    DemoProduct { code: "PKG005", name: "Cadbury Dairy Milk Silk Chocolate", category_name: "Packaged Goods", price_paise: 8000, gst_enabled: true, gst_percentage_x100: 1800, barcode: "8908005" },
    DemoProduct { code: "PKG006", name: "KitKat 4-Finger Wafer Chocolate", category_name: "Packaged Goods", price_paise: 4000, gst_enabled: true, gst_percentage_x100: 1800, barcode: "8908006" },
    DemoProduct { code: "PKG007", name: "Red Bull Energy Drink 250ml", category_name: "Packaged Goods", price_paise: 12500, gst_enabled: true, gst_percentage_x100: 2800, barcode: "8908007" },
    DemoProduct { code: "PKG008", name: "Coca Cola / Pepsi Can 300ml", category_name: "Packaged Goods", price_paise: 4000, gst_enabled: true, gst_percentage_x100: 2800, barcode: "8908008" },
    DemoProduct { code: "PKG009", name: "Ice Mint Refreshment Chews (Pack)", category_name: "Packaged Goods", price_paise: 1500, gst_enabled: true, gst_percentage_x100: 1800, barcode: "8908009" },
    DemoProduct { code: "PKG010", name: "Sanitizing Wet Wipes (Pack of 10)", category_name: "Packaged Goods", price_paise: 3000, gst_enabled: true, gst_percentage_x100: 1800, barcode: "8908010" },
];

/// Seeds all demo categories and 100+ demo products into the SQLite connection
pub fn seed_demo_data(conn: &Connection) -> Result<usize, String> {
    // 1. Ensure all categories exist
    for (name, sort_order) in DEMO_CATEGORIES {
        let _ = conn.execute(
            "INSERT OR IGNORE INTO categories (name, sort_order, is_active) VALUES (?1, ?2, 1)",
            params![name, sort_order],
        );
        // Also update sort order if exists
        let _ = conn.execute(
            "UPDATE categories SET sort_order = ?1, is_active = 1 WHERE name = ?2",
            params![sort_order, name],
        );
    }

    // 2. Fetch category map (name -> id)
    let mut stmt = conn.prepare("SELECT id, name FROM categories")
        .map_err(|e| format!("Prepare error: {}", e))?;
    let cat_rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(1)?, row.get::<_, i64>(0)?))
    }).map_err(|e| format!("Query error: {}", e))?;

    let mut cat_map = std::collections::HashMap::new();
    for r in cat_rows.flatten() {
        cat_map.insert(r.0, r.1);
    }

    // 3. Insert each demo product
    let mut inserted_count = 0;
    for p in DEMO_PRODUCTS {
        let cat_id = cat_map.get(p.category_name).cloned().unwrap_or(1);
        let res = conn.execute(
            "INSERT OR REPLACE INTO products (
                product_code, name, category_id, image_path, selling_price_paise,
                gst_enabled, gst_percentage_x100, barcode, is_active
            ) VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6, ?7, 1)",
            params![
                p.code,
                p.name,
                cat_id,
                p.price_paise,
                if p.gst_enabled { 1 } else { 0 },
                p.gst_percentage_x100,
                p.barcode,
            ],
        );
        if res.is_ok() {
            inserted_count += 1;
        }
    }

    Ok(inserted_count)
}

/// Clears only demo products from the database if requested
pub fn clear_demo_data(conn: &Connection) -> Result<usize, String> {
    let count = conn.execute("DELETE FROM products WHERE product_code LIKE 'JUC%' OR product_code LIKE 'SNK%' OR product_code LIKE 'FST%' OR product_code LIKE 'ICM%' OR product_code LIKE 'BAK%' OR product_code LIKE 'HOT%' OR product_code LIKE 'MEL%' OR product_code LIKE 'PKG%'", [])
        .map_err(|e| e.to_string())?;
    Ok(count)
}
